import type { GedcomLine, GedcomNode, GedcomRecord } from "./types";

/**
 * Parse a GEDCOM file text into a flat array of lines.
 * Handles both CRLF and LF line endings and strips BOM.
 */
function parseLines(text: string): GedcomLine[] {
  // Strip BOM if present
  const cleaned = text.startsWith("\uFEFF") ? text.slice(1) : text;

  return cleaned
    .split(/\r\n|\r|\n/)
    .filter(line => line.trim() !== "")
    .map((raw, index) => {
      // Format: LEVEL [XREF] TAG [VALUE]
      const match = raw.match(/^(\d+)\s+(@[^@]+@)?\s*(\S+)(?:\s+(.*))?$/);
      if (!match) {
        throw new Error(`Invalid GEDCOM line ${index + 1}: ${raw.trim()}`);
      }
      return {
        level: parseInt(match[1], 10),
        xref: match[2] ?? null,
        tag: match[3],
        value: match[4]?.trim() ?? "",
      };
    });
}

/**
 * Build a tree of GedcomNodes from a flat line array.
 * Returns the top-level (level-0) nodes.
 */
function buildTree(lines: GedcomLine[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];

  for (const line of lines) {
    const node: GedcomNode = { line, children: [] };

    if (line.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack.push(node);
    } else {
      if (stack.length === 0) {
        throw new Error(
          `Invalid GEDCOM structure: encountered level ${line.level} without a parent.`,
        );
      }

      // Pop until parent level is (line.level - 1)
      while (stack.length > 1 && stack[stack.length - 1].line.level >= line.level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      if (parent.line.level !== line.level - 1) {
        throw new Error(
          `Invalid GEDCOM structure: level jump from ${parent.line.level} to ${line.level}.`,
        );
      }
      parent.children.push(node);
      stack.push(node);
    }
  }

  return roots;
}

/**
 * Parse raw GEDCOM text into an array of top-level GedcomRecords.
 */
export function parseGedcom(text: string): GedcomRecord[] {
  const lines = parseLines(text);
  const roots = buildTree(lines);

  return roots.map(node => ({
    id: node.line.xref,
    tag: node.line.tag,
    value: node.line.value,
    children: node.children,
  }));
}

/**
 * Find the first direct child node with the given tag.
 */
export function findChild(nodes: GedcomNode[], tag: string): GedcomNode | undefined {
  return nodes.find(n => n.line.tag === tag);
}

/**
 * Find all direct child nodes with the given tag.
 */
export function findChildren(nodes: GedcomNode[], tag: string): GedcomNode[] {
  return nodes.filter(n => n.line.tag === tag);
}

/**
 * Get the value of the first direct child with the given tag, or null.
 */
export function childValue(nodes: GedcomNode[], tag: string): string | null {
  return findChild(nodes, tag)?.line.value ?? null;
}
