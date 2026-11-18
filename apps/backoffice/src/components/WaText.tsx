import { Fragment, type ReactNode } from "react";

/** Renders WhatsApp-style text: *bold*, _italic_, ~strike~ and clickable links. No HTML injection. */
export function WaText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(https?:\/\/[^\s]+)|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      const url = m[1].replace(/[),.!?]+$/, "");
      const trailing = m[1].slice(url.length);
      parts.push(
        <a key={i++} href={url} target="_blank" rel="noreferrer" style={{ color: "#027eb5", wordBreak: "break-all" }}>
          {url}
        </a>,
      );
      if (trailing) parts.push(trailing);
    } else if (m[2]) parts.push(<b key={i++}>{m[2]}</b>);
    else if (m[3]) parts.push(<i key={i++}>{m[3]}</i>);
    else if (m[4]) parts.push(<s key={i++}>{m[4]}</s>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, idx) => (
        <Fragment key={idx}>{p}</Fragment>
      ))}
    </>
  );
}
