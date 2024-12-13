// ****************************************************************************
//
// RTF formatting table
//
// ****************************************************************************

import {elemAsText, elemName} from "../../document"
import {getHeader} from "../../document/head"

//-----------------------------------------------------------------------------

const fonts = `{\\fonttbl
\\f0\\froman\\fcharset0 Times New Roman;
}`

const colors = `{\\colortbl;
\\red0\\green0\\blue0;
\\red180\\green20\\blue20;
}`

//-----------------------------------------------------------------------------

const paperwidth = 11905
const paperheight = 16837
const textwidth  = paperwidth - 2*1701
const gutter = 500

const paperA4 = `\\paperh${paperheight}\\paperw${paperwidth}
\\margt851\\margb1701`

const singleA4 = `${paperA4}
\\margl${(paperwidth-textwidth)/2}
\\margr${(paperwidth-textwidth)/2}
\\gutter0`

const doubleA4 = `\\margmirror
${paperA4}
\\margl${(paperwidth-textwidth)/2 + gutter}
\\margr${(paperwidth-textwidth)/2 - gutter}`

//-----------------------------------------------------------------------------

export const formatRTF = {
  // Info
  suffix: ".rtf",

  // File
  head: (head, options) => {
    const pgbreak = options.pgbreak ? "\\page" : ""

    const {author, title, subtitle} = head
    const headinfo = getHeader(head)
    const langcode = 1035

    const pgnum = `{\\field{\\*\\fldinst PAGE}}`
    const pgtot = `{\\field{\\*\\fldinst NUMPAGES}}`

    return `{\\rtf1\\ansi\\deff0
${fonts}
${colors}
{\\info
{\\title ${escape(title)}}
${author ? `{\\author ${escape(author)}}` : ""}
}
\\deflang${langcode}
${singleA4}
\\sectd\\margtsxn1701
\\sbknone\\ltrsect\\stextflow0

{\\header\\lang${langcode}\\tqr\\tx8496
${escape(headinfo)}\\tab ${pgnum} / ${pgtot}
\\par}

\\lang${langcode}
\\sl440

${author ? `{\\sa220\\qc ${escape(author)}\\par}` : ""}
{\\sa440\\qc\\b\\fs34 ${escape(title)}\\par}
${subtitle ? "{\\sa440\\qc\\b\\fs28" + escape(subtitle) + "\\par}" : ""}
`},

  footer: () => "}\n",

  //\\headery851\\f0\\fs24\\fi0\\li0\\ri0\\rin0\\lin0

  //---------------------------------------------------------------------------
  // Headings
  //---------------------------------------------------------------------------

  hact: (p) => {
    const {title, number} = p
    if(!title && !number) return

    const numbering = number ? [`${number}`] : []
    const text = title ? [title] : []
    const head = [ ...numbering, ...text].join(". ")
    const pgbreak = p.pgbreak ? "\\pagebb" : ""

    return `{${pgbreak}\\sb1000\\qc\\b\\fs32 ${escape(head)}\\par}`
  },

  hchapter: (p) => {

    const {title, number} = p
    if(!title && !number) return

    const numbering = number ? [`${number}`] : []
    const text = title ? [title] : []
    const head = [ ...numbering, ...text].join(". ")
    const pgbreak = p.pgbreak ? "\\pagebb" : "\\sb480"

    return `{${pgbreak}\\b\\fs28 ${escape(head)}\\par}`
  },

  hscene: undefined,

  //---------------------------------------------------------------------------
  // Breaks
  //---------------------------------------------------------------------------

  separator: () => `{\\sb480\\qc ${escape("* * *")}\\par}`,
  //br: () => "\n",

  //---------------------------------------------------------------------------
  // Paragraph styles
  //---------------------------------------------------------------------------

  //split: (paragraphs) => "{\\sb480" + paragraphs.join("{\\fi567"),

  "missing": (p, text) => `{${p.first ? "\\sb480" : "\\fi567"}\\cf2 ${text}\\par}`,
  "p": (p, text) => `{${p.first ? "\\sb480" : "\\fi567 "}${text}\\par}`,

  //"bookmark": (p) => undefined,
  //"comment": (p) => undefined,

  //---------------------------------------------------------------------------
  // Character styles
  //---------------------------------------------------------------------------

  "b": (text) => `{\\b ${text}}`,
  "i": (text) => `{\\i ${text}}`,
  "text": (text) => escape(text),

  //---------------------------------------------------------------------------
}

//-----------------------------------------------------------------------------

function escape(text) {
  if(!text) return text

  return text.split("").map(charEscape).join("")

  function charEscape(c) {
    const code = c.charCodeAt(0)
    if(code > 127) return `\\u${code}?`
    switch(c) {
      case '\\': return "\\\\"
      case '{': return "\\{"
      case '}': return "\\}"
      //case '~': return "\\~"
      case '"': return "\\'94"
    }
    return c
  }
}
