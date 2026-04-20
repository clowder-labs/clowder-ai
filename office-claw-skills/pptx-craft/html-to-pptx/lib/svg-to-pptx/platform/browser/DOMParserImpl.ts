// src/platform/browser/DOMParserImpl.ts
import { DOMDocument, DOMNode } from '../types'
import { DOMParserInterface } from '../DOMParser'

// 浏览器 DOM 节点包装器
class BrowserDOMNode implements DOMNode {
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
    return Array.from(this.element.children).map(el => new BrowserDOMNode(el))
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
      .map(el => new BrowserDOMNode(el))
  }
}

class BrowserDOMDocument implements DOMDocument {
  constructor(private doc: Document) {}

  get documentElement(): DOMNode {
    return new BrowserDOMNode(this.doc.documentElement)
  }

  querySelector(selector: string): DOMNode | null {
    const el = this.doc.querySelector(selector)
    return el ? new BrowserDOMNode(el) : null
  }
}

export class BrowserDOMParser implements DOMParserInterface {
  parseFromString(svgString: string): DOMDocument {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svgString, 'image/svg+xml')
    return new BrowserDOMDocument(doc)
  }
}