import CoreBluetooth
import Darwin
import Foundation

private enum OperationKind {
    case inspect
    case read
    case subscribe
}

private final class DeviceOperation {
    let request: BleRequest
    let kind: OperationKind
    let serviceUuid: CBUUID?
    let characteristicUuid: CBUUID?
    var pendingServiceCount = 0
    var timeout: DispatchWorkItem?

    init(request: BleRequest, kind: OperationKind, serviceUuid: CBUUID? = nil, characteristicUuid: CBUUID? = nil) {
        self.request = request
        self.kind = kind
        self.serviceUuid = serviceUuid
        self.characteristicUuid = characteristicUuid
    }
}

final class BleController: NSObject, BleCommandHandling, CBCentralManagerDelegate, CBPeripheralDelegate {
    private let writer: ProtocolWriter
    private var central: CBCentralManager!
    private var devices: [UUID: CBPeripheral] = [:]
    private var activeScanSessionId: String?
    private var scanTimeout: DispatchWorkItem?
    private var operations: [UUID: DeviceOperation] = [:]
    private var subscriptions: [String: String] = [:]

    init(writer: ProtocolWriter) {
        self.writer = writer
        super.init()
        central = CBCentralManager(
            delegate: self,
            queue: DispatchQueue.main,
            options: [CBCentralManagerOptionShowPowerAlertKey: false]
        )
    }

    func handle(_ request: BleRequest) {
        switch request.command {
        case "scan.start": startScan(request)
        case "scan.stop": stopScan(request)
        case "device.inspect": beginDeviceOperation(request, kind: .inspect)
        case "gatt.read": beginDeviceOperation(request, kind: .read)
        case "gatt.subscribe": beginDeviceOperation(request, kind: .subscribe)
        case "device.disconnect": disconnect(request)
        case "helper.shutdown": shutdown(request)
        default: writer.error(requestId: request.requestId, code: "unsupported_command")
        }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let state: String
        switch central.state {
        case .poweredOn: state = "poweredOn"
        case .poweredOff: state = "poweredOff"
        case .unauthorized: state = "unauthorized"
        case .unsupported: state = "unsupported"
        case .resetting: state = "resetting"
        default: state = "unknown"
        }
        writer.event(name: "adapter.state", data: ["state": state])
        if central.state != .poweredOn, activeScanSessionId != nil {
            finishScan(state: "stopped")
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        guard let sessionId = activeScanSessionId else { return }
        devices[peripheral.identifier] = peripheral
        peripheral.delegate = self
        let advertisedServices = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
        let rawName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
        let name = rawName.map { String($0.prefix(128)) }
        let rssi = min(20, max(-127, RSSI.intValue))
        writer.event(name: "scan.discovered", data: [
            "sessionId": sessionId,
            "deviceId": peripheral.identifier.uuidString,
            "name": name ?? NSNull(),
            "rssi": rssi,
            "serviceUuids": advertisedServices.prefix(64).map(\.uuidString),
        ])
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        startDiscovery(for: peripheral)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        failOperation(peripheral.identifier, code: "connect_failed")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if operations[peripheral.identifier] != nil {
            failOperation(peripheral.identifier, code: "device_disconnected")
        }
        subscriptions = subscriptions.filter { !$0.key.hasPrefix("\(peripheral.identifier.uuidString.lowercased()):") }
        devices.removeValue(forKey: peripheral.identifier)
        writer.event(name: "device.disconnected", data: [
            "deviceId": peripheral.identifier.uuidString,
            "reason": error.map { String($0.localizedDescription.prefix(256)) } ?? NSNull(),
        ])
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let operation = operations[peripheral.identifier] else { return }
        guard error == nil, let services = peripheral.services, services.count <= 64 else {
            failOperation(peripheral.identifier, code: "service_discovery_failed")
            return
        }
        switch operation.kind {
        case .inspect:
            operation.pendingServiceCount = services.count
            if services.isEmpty {
                completeInspection(peripheral)
                return
            }
            for service in services {
                peripheral.discoverCharacteristics(nil, for: service)
            }
        case .read, .subscribe:
            guard let target = operation.serviceUuid,
                  let service = services.first(where: { $0.uuid == target })
            else {
                failOperation(peripheral.identifier, code: "service_not_found")
                return
            }
            peripheral.discoverCharacteristics(operation.characteristicUuid.map { [$0] }, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let operation = operations[peripheral.identifier] else { return }
        guard error == nil, let characteristics = service.characteristics, characteristics.count <= 128 else {
            failOperation(peripheral.identifier, code: "characteristic_discovery_failed")
            return
        }
        if operation.kind == .inspect {
            operation.pendingServiceCount -= 1
            if operation.pendingServiceCount == 0 {
                completeInspection(peripheral)
            }
            return
        }
        guard let target = operation.characteristicUuid,
              let characteristic = characteristics.first(where: { $0.uuid == target })
        else {
            failOperation(peripheral.identifier, code: "characteristic_not_found")
            return
        }
        if operation.kind == .read {
            guard characteristic.properties.contains(.read) else {
                failOperation(peripheral.identifier, code: "characteristic_not_readable")
                return
            }
            peripheral.readValue(for: characteristic)
        } else {
            guard characteristic.properties.contains(.notify) || characteristic.properties.contains(.indicate) else {
                failOperation(peripheral.identifier, code: "characteristic_not_notifiable")
                return
            }
            peripheral.setNotifyValue(true, for: characteristic)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let operation = operations[peripheral.identifier], operation.kind == .read,
           characteristic.uuid == operation.characteristicUuid {
            guard error == nil, let value = characteristic.value, value.count <= bleMaxValueBytes else {
                failOperation(peripheral.identifier, code: "characteristic_read_failed")
                return
            }
            writer.response(requestId: operation.request.requestId, data: ["valueBase64": value.base64EncodedString()])
            clearOperation(peripheral.identifier)
            releasePeripheralUnlessSubscribed(peripheral)
            return
        }
        let key = subscriptionKey(peripheral: peripheral, characteristic: characteristic)
        guard subscriptions[key] != nil, error == nil, let value = characteristic.value, value.count <= bleMaxValueBytes,
              let service = characteristic.service
        else { return }
        writer.event(name: "gatt.notification", data: [
            "deviceId": peripheral.identifier.uuidString,
            "serviceUuid": service.uuid.uuidString,
            "characteristicUuid": characteristic.uuid.uuidString,
            "valueBase64": value.base64EncodedString(),
            "observedAt": Int(Date().timeIntervalSince1970 * 1000),
        ])
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard let operation = operations[peripheral.identifier], operation.kind == .subscribe,
              characteristic.uuid == operation.characteristicUuid
        else { return }
        guard error == nil, characteristic.isNotifying else {
            failOperation(peripheral.identifier, code: "subscription_failed")
            return
        }
        subscriptions[subscriptionKey(peripheral: peripheral, characteristic: characteristic)] = operation.request.requestId
        writer.response(requestId: operation.request.requestId, data: ["subscribed": true])
        clearOperation(peripheral.identifier)
    }

    private func startScan(_ request: BleRequest) {
        guard central.state == .poweredOn else {
            writer.error(requestId: request.requestId, code: "bluetooth_not_powered_on")
            return
        }
        guard activeScanSessionId == nil,
              let sessionId = boundedString(request.params["sessionId"], max: 128),
              let timeoutMs = boundedInt(request.params["timeoutMs"], min: 1, max: 30_000)
        else {
            writer.error(requestId: request.requestId, code: "invalid_or_active_scan")
            return
        }
        activeScanSessionId = sessionId
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        writer.response(requestId: request.requestId, data: ["started": true])
        writer.event(name: "scan.state", data: ["sessionId": sessionId, "state": "started"])
        let timeout = DispatchWorkItem { [weak self] in
            guard self?.activeScanSessionId == sessionId else { return }
            self?.finishScan(state: "timeout")
        }
        scanTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: timeout)
    }

    private func stopScan(_ request: BleRequest) {
        guard let sessionId = boundedString(request.params["sessionId"], max: 128),
              sessionId == activeScanSessionId
        else {
            writer.error(requestId: request.requestId, code: "scan_session_mismatch")
            return
        }
        finishScan(state: "stopped")
        writer.response(requestId: request.requestId, data: ["stopped": true])
    }

    private func finishScan(state: String) {
        guard let sessionId = activeScanSessionId else { return }
        central.stopScan()
        scanTimeout?.cancel()
        scanTimeout = nil
        activeScanSessionId = nil
        // Nearby, unbound peripherals are scan-session data. Retain only
        // devices with an operation in flight or an active subscription.
        for (identifier, peripheral) in devices
            where operations[identifier] == nil && !hasSubscription(identifier)
        {
            if peripheral.state == .connected || peripheral.state == .connecting {
                central.cancelPeripheralConnection(peripheral)
            }
            devices.removeValue(forKey: identifier)
        }
        writer.event(name: "scan.state", data: ["sessionId": sessionId, "state": state])
    }

    private func beginDeviceOperation(_ request: BleRequest, kind: OperationKind) {
        guard central.state == .poweredOn,
              let deviceId = boundedString(request.params["deviceId"], max: 128),
              let uuid = UUID(uuidString: deviceId),
              let peripheral = resolvePeripheral(uuid)
        else {
            writer.error(requestId: request.requestId, code: "device_unavailable")
            return
        }
        guard operations[uuid] == nil else {
            writer.error(requestId: request.requestId, code: "device_busy")
            return
        }

        var serviceUuid: CBUUID?
        var characteristicUuid: CBUUID?
        if kind != .inspect {
            guard let service = boundedString(request.params["serviceUuid"], max: 64),
                  let characteristic = boundedString(request.params["characteristicUuid"], max: 64)
            else {
                writer.error(requestId: request.requestId, code: "invalid_gatt_target")
                return
            }
            serviceUuid = CBUUID(string: service)
            characteristicUuid = CBUUID(string: characteristic)
        }

        let operation = DeviceOperation(
            request: request,
            kind: kind,
            serviceUuid: serviceUuid,
            characteristicUuid: characteristicUuid
        )
        let timeout = DispatchWorkItem { [weak self] in
            self?.failOperation(uuid, code: "operation_timeout")
        }
        operation.timeout = timeout
        operations[uuid] = operation
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout)
        peripheral.delegate = self
        if peripheral.state == .connected {
            startDiscovery(for: peripheral)
        } else {
            central.connect(peripheral, options: nil)
        }
    }

    private func startDiscovery(for peripheral: CBPeripheral) {
        guard let operation = operations[peripheral.identifier] else { return }
        if operation.kind == .inspect {
            peripheral.discoverServices(nil)
        } else if let serviceUuid = operation.serviceUuid {
            peripheral.discoverServices([serviceUuid])
        }
    }

    private func completeInspection(_ peripheral: CBPeripheral) {
        guard let operation = operations[peripheral.identifier] else { return }
        let services = (peripheral.services ?? []).prefix(64).map { service -> [String: Any] in
            let characteristics = (service.characteristics ?? []).prefix(128).map { characteristic in
                [
                    "uuid": characteristic.uuid.uuidString,
                    "properties": propertyNames(characteristic.properties),
                ] as [String: Any]
            }
            return ["uuid": service.uuid.uuidString, "characteristics": characteristics]
        }
        writer.response(requestId: operation.request.requestId, data: ["services": services])
        clearOperation(peripheral.identifier)
        releasePeripheralUnlessSubscribed(peripheral)
    }

    private func disconnect(_ request: BleRequest) {
        guard let deviceId = boundedString(request.params["deviceId"], max: 128),
              let uuid = UUID(uuidString: deviceId),
              let peripheral = resolvePeripheral(uuid)
        else {
            writer.error(requestId: request.requestId, code: "device_unavailable")
            return
        }
        clearOperation(uuid)
        if peripheral.state == .connected || peripheral.state == .connecting {
            central.cancelPeripheralConnection(peripheral)
        }
        subscriptions = subscriptions.filter { !$0.key.hasPrefix("\(uuid.uuidString.lowercased()):") }
        devices.removeValue(forKey: uuid)
        writer.response(requestId: request.requestId, data: ["disconnected": true])
    }

    private func shutdown(_ request: BleRequest) {
        if activeScanSessionId != nil { finishScan(state: "stopped") }
        for operationId in operations.keys { clearOperation(operationId) }
        for peripheral in devices.values where peripheral.state == .connected || peripheral.state == .connecting {
            central.cancelPeripheralConnection(peripheral)
        }
        writer.response(requestId: request.requestId, data: ["stopping": true])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            Darwin.exit(0)
        }
    }

    private func resolvePeripheral(_ identifier: UUID) -> CBPeripheral? {
        if let existing = devices[identifier] { return existing }
        guard let retrieved = central.retrievePeripherals(withIdentifiers: [identifier]).first else { return nil }
        devices[identifier] = retrieved
        retrieved.delegate = self
        return retrieved
    }

    private func failOperation(_ identifier: UUID, code: String) {
        guard let operation = operations[identifier] else { return }
        writer.error(requestId: operation.request.requestId, code: code)
        clearOperation(identifier)
        if let peripheral = devices[identifier] {
            releasePeripheralUnlessSubscribed(peripheral)
        }
    }

    private func clearOperation(_ identifier: UUID) {
        operations[identifier]?.timeout?.cancel()
        operations.removeValue(forKey: identifier)
    }

    private func subscriptionKey(peripheral: CBPeripheral, characteristic: CBCharacteristic) -> String {
        let service = characteristic.service?.uuid.uuidString.lowercased() ?? "unknown"
        return "\(peripheral.identifier.uuidString.lowercased()):\(service):\(characteristic.uuid.uuidString.lowercased())"
    }

    private func hasSubscription(_ identifier: UUID) -> Bool {
        let prefix = "\(identifier.uuidString.lowercased()):"
        return subscriptions.keys.contains { $0.hasPrefix(prefix) }
    }

    private func releasePeripheralUnlessSubscribed(_ peripheral: CBPeripheral) {
        guard !hasSubscription(peripheral.identifier) else { return }
        if peripheral.state == .connected || peripheral.state == .connecting {
            central.cancelPeripheralConnection(peripheral)
        }
        devices.removeValue(forKey: peripheral.identifier)
    }
}

private func boundedString(_ value: Any?, max: Int) -> String? {
    guard let string = value as? String, !string.isEmpty, string.utf8.count <= max else { return nil }
    return string
}

private func boundedInt(_ value: Any?, min: Int, max: Int) -> Int? {
    guard let number = value as? NSNumber,
          CFGetTypeID(number) != CFBooleanGetTypeID(),
          number.doubleValue.rounded(.towardZero) == number.doubleValue
    else { return nil }
    let intValue = number.intValue
    return intValue >= min && intValue <= max ? intValue : nil
}

private func propertyNames(_ properties: CBCharacteristicProperties) -> [String] {
    var names: [String] = []
    if properties.contains(.read) { names.append("read") }
    if properties.contains(.notify) { names.append("notify") }
    if properties.contains(.indicate) { names.append("indicate") }
    if properties.contains(.write) { names.append("write") }
    if properties.contains(.writeWithoutResponse) { names.append("writeWithoutResponse") }
    return names
}
