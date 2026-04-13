// src/platform/node/DOMParserImpl.ts
import { JSDOM } from 'jsdom'
import { DOMDocument, DOMNode } from '../types'
import { DOMParserInterface } from '../DOMParser'

// JSDOM 节点包装器
class JSDOMNode implements DOMNode {
  constructor(private element: Element) {}

  get tagName(): string {
    return this.element.tagName.toLowerCase()
  }

  get attributes(): Record<string, string> {
    const attrs: Record<string, string> = {}
    for (const attr of Array.from(this.element.attributes)) {
      attrs[attr.name] = attr.value
    }
    return attrs
  }

  get children(): DOMNode[] {
    return Array.from(this.element.children).map(el => new JSDOMNode(el))
  }

  get textContent(): string | undefined {
    return this.element.textContent || undefined
  }

  getAttribute(name: string): string | null {
    return this.element.getAttribute(name)
  }

  hasAttribute(name: string): boolean {
    return this.element.hasAttribute(name)
  }

  querySelectorAll(selector: string): DOMNode[] {
    return Array.from(this.element.querySelectorAll(selector))
      .map(el => new JSDOMNode(el))
  }
}

class JSDOMDocument implements DOMDocument {
  constructor(private doc: Document) {}

  get documentElement(): DOMNode {
    return new JSDOMNode(this.doc.documentElement)
  }

  querySelector(selector: string): DOMNode | null {
    const el = this.doc.querySelector(selector)
    return el ? new JSDOMNode(el) : null
  }
}

export class NodeDOMParser implements DOMParserInterface {
  parseFromString(svgString: string): DOMDocument {
    const dom = new JSDOM(svgString, { contentType: 'image/svg+xml' })
    return new JSDOMDocument(dom.window.document)
  }
}