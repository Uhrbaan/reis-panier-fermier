// moteur de texte riche (Option 1 : gras, italique, sous-titres, listes) 
// sans aucune librairie à installer, sécurisé contre les injections HTML.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function renderRichText(source: string): string {
  if (!source.trim()) return "";

  const lines = escapeHtml(source).split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith("- ")) {
      if (!inList) {
        html.push('<ul class="list-disc pl-5 space-y-1 my-2">');
        inList = true;
      }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    if (line.startsWith("## ")) {
      html.push(`<h3 class="text-base font-semibold text-gray-900 mt-3 mb-1">${formatInline(line.slice(3))}</h3>`);
    } else if (line === "") {
      html.push('<div class="h-2"></div>');
    } else {
      html.push(`<p class="leading-relaxed">${formatInline(line)}</p>`);
    }
  }

  if (inList) html.push("</ul>");
  return html.join("\n");
}