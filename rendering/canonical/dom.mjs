// Shared canonical DOM contract for renderer and production HTTP parity.
export async function canonicalDocument(page, html) {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  return page.evaluate(() => {
    const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
    const canonical = (node) => {
      if (node.nodeType === Node.COMMENT_NODE) return null;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.nodeValue ?? "").replace(/\s+/g, " ");
        return text.trim() ? ["#text", text] : null;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node;
      if (
        element.tagName === "LINK" &&
        element.getAttribute("rel")?.toLowerCase() === "preload"
      ) return null;
      const attributes = Array.from(element.attributes)
        .filter(({ name }) => name !== "data-reactroot")
        .map((
          { name, value },
        ) => [
          name,
          name === "class"
            ? value.trim().split(/\s+/).filter(Boolean).sort().join(" ")
            : value,
        ])
        .sort(([left], [right]) => left.localeCompare(right));
      const rawChildren = Array.from(element.childNodes).map(canonical).filter(
        Boolean,
      );
      const children = [];
      for (const child of rawChildren) {
        const previous = children.at(-1);
        if (child[0] === "#text" && previous?.[0] === "#text") {
          previous[1] = normalizeText(previous[1] + child[1]);
        } else if (child[0] === "#text") {
          children.push(["#text", normalizeText(child[1])]);
        } else children.push(child);
      }
      if (element.tagName === "HEAD") {
        children.sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right))
        );
      }
      return [element.tagName.toLowerCase(), attributes, children];
    };
    return [document.compatMode, canonical(document.documentElement)];
  });
}

export function firstDifference(expected, actual) {
  const limit = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < limit && expected[index] === actual[index]) index += 1;
  const start = Math.max(0, index - 120);
  return {
    index,
    expected: expected.slice(start, index + 120),
    actual: actual.slice(start, index + 120),
  };
}
