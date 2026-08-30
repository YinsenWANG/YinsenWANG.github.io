type MarkdownNode = {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MarkdownNode[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function transform(node: MarkdownNode): void {
  if (node.type === "code" && node.lang === "mermaid") {
    node.type = "html";
    node.value = `<div class="mermaid">${escapeHtml(node.value ?? "")}</div>`;
    delete node.lang;
    return;
  }

  node.children?.forEach(transform);
}

export default function remarkMermaid() {
  return (tree: unknown) => transform(tree as MarkdownNode);
}
