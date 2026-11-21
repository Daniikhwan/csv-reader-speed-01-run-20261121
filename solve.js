// Fast CSV reader: a drop-in replacement for csv-reader 1.0.0 (make.fun).
//
// It returns exactly what csv-reader returns for every input {text, header}:
// {columns, rows, errors}, following the same broken-row policy:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, each CRLF or lone CR inside it read as LF; what follows
//     its closing quote, up to the next comma or line break, is appended as it stands
//     (quote_junk, when the field ends); a quote that never closes is a literal
//     character, and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded (short_row) or cut (long_row) to the first
//     record's width; each error is {code, line, row} in the order met.
//
// Speed: the reference reads one character at a time and builds every field with
// `value += c`. This reader instead jumps with indexOf between delimiters and
// takes each field with one slice, so the common paths do no per-character work
// at all; a record with no quote and no stray CR is split in one C++ pass.
// Stray CRs, line breaks inside quotes and doubled quotes are the only cases
// that build a string piece by piece, and they are rare in drawn files.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes.
  let recordLine = 1;
  let recordRow = null;

  // How the field being read ended.
  let fend = END;

  // The next LF at or after pos, or Infinity when the text holds no more.
  // Valid while it is at or after pos; refreshed when pos moves past it (a
  // quoted field that spans lines). One indexOf per record, not per field.
  let lineEnd = Infinity;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // The segment [p, q) of a quoted field, with every CRLF and lone CR read as LF.
  // Advances `line` by the breaks inside it. The common case (no break inside)
  // is one slice and two short checks on it.
  function normalize(p, q) {
    const seg = text.slice(p, q);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
    const parts = seg.split(/\r\n|\r|\n/);
    line += parts.length - 1;
    return parts.join('\n');
  }

  // Reads unquoted characters from pos. Returns the field; sets fend.
  // The line's end is cached in lineEnd (refreshed when pos moves past it),
  // so this finds the field's end with one indexOf for the comma alone.
  function readUnquoted() {
    if (lineEnd < pos) {
      const n = text.indexOf('\n', pos);
      lineEnd = n === -1 ? Infinity : n;
    }
    const c = text.indexOf(',', pos);
    let end;
    if (c !== -1 && c < lineEnd) {
      end = c;
      fend = COMMA;
    } else if (lineEnd !== Infinity) {
      // A CR right before the LF is the CRLF line break, not part of the field.
      end = lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
      fend = LINE_BREAK;
    } else {
      end = len;
      fend = END;
    }
    let f = text.slice(pos, end);
    // Any CR left in the field is a stray CR: one error each, and dropped.
    if (f.indexOf('\r') !== -1) {
      let count = 0;
      for (let i = 0; i < f.length; i++) if (f.charCodeAt(i) === 13) count += 1;
      for (let i = 0; i < count; i++) error('stray_cr');
      f = f.replaceAll('\r', '');
    }
    pos = fend === COMMA ? end + 1 : fend === LINE_BREAK ? end + 1 : len;
    if (fend === LINE_BREAK) {
      // pos already moved past the LF (end is the LF, or the CR of a CRLF).
      if (text.charCodeAt(end) === 13) pos = end + 2;
      line += 1;
    }
    return f;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = pos + 1;
    let parts = null;
    while (true) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted. The line count goes back to the open.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return '"' + readUnquoted();
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: the segment plus one quote, then on.
        const seg = normalize(p, q);
        if (parts === null) parts = [];
        parts.push(seg, '"');
        p = q + 2;
        continue;
      }
      // The closing quote is at q.
      const seg = normalize(p, q);
      const value = parts === null ? seg : parts.join('') + seg;
      pos = q + 1;
      if (pos >= len) {
        fend = END;
        return value;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 44) {
        pos += 1;
        fend = COMMA;
        return value;
      }
      if (ch === 10) {
        pos += 1;
        line += 1;
        fend = LINE_BREAK;
        return value;
      }
      if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fend = LINE_BREAK;
        return value;
      }
      // What follows the closing quote is appended as it stands, up to the next
      // comma or line break.
      const junk = readUnquoted();
      if (junk.length > 0) error('quote_junk');
      return junk.length === 0 ? value : value + junk;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let lastQuoted;
    // Fast path: a record with no quote and no stray CR is one line, split at once.
    const nl = text.indexOf('\n', pos);
    lineEnd = nl === -1 ? Infinity : nl;
    const lineEndIdx = nl === -1 ? len : nl;
    const contentEnd = nl !== -1 && nl > pos && text.charCodeAt(nl - 1) === 13 ? nl - 1 : lineEndIdx;
    const lineStr = text.slice(pos, contentEnd);
    if (lineStr.indexOf('"') === -1 && lineStr.indexOf('\r') === -1) {
      fields = lineStr.split(',');
      lastQuoted = false;
      pos = nl === -1 ? len : nl + 1;
      if (nl !== -1) line += 1;
    } else {
      fields = [];
      lastQuoted = false;
      while (true) {
        lastQuoted = text.charCodeAt(pos) === 34;
        fields.push(lastQuoted ? readQuoted() : readUnquoted());
        if (fend !== COMMA) break;
      }
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
