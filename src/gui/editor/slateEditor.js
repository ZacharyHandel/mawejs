//*****************************************************************************
//*****************************************************************************
//
// Slate as editor component
//
//*****************************************************************************
//*****************************************************************************

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react'
import {
  Editor, Node,
  Transforms,
  Range,
  Point,
  createEditor,
  Descendant,
} from 'slate'

import { withHistory } from "slate-history"
import { addClass, Icon } from '../common/factory';
import { uuid, nanoid, splitByLeadingElem } from '../../util';

export { ReactEditor }

//-----------------------------------------------------------------------------

export function elem2text(block) {
  return Node.string(block)
    .replace(/\s+/g, ' ')
    .trim()
}

function elemLeader(elem) {
  return elem2text(elem).split(/[.:?!]/gu, 1)[0]
}

//*****************************************************************************
//
// Rendering
//
//*****************************************************************************

export function RenderPlain({ content }) {
}

export function Element(props) {
  const { element, attributes, children } = props;

  function WithLink({children, props}) {
    return <a id={`${element.id}`} {...props}>{children}</a>
  }

  switch (element.type) {
    case "title": return <h1 {...attributes}>{children}</h1>
    case "br.part": return <h2 {...attributes}><WithLink>{children}</WithLink></h2>
    case "br.scene": return <h3 {...attributes}><WithLink>{children}</WithLink></h3>
    case "synopsis": return <h4 {...attributes}><WithLink>{children}</WithLink></h4>

    /*
    case "part": return <div className="part">{children}</div>
    case "scene": return <div className="scene">{children}</div>

    case "float": return (
      <p className="FloatHandle">
        <Icon.PaperClipHoriz style={{fontsize: "14pt", color: "green"}}/>
        <div contenteditable="false" className="FloatContent comment">{elem2text(element)}</div>
      </p>
    )
    */
    case "comment":
    case "missing":
    //case "synopsis":
      return <p className={element.type} {...attributes}><WithLink>{children}</WithLink></p>

    case "p":
    default:
      if (elem2text(element) === "") {
        return <div className="emptyline" {...attributes}>{children}</div>
      }
      return <p {...attributes}>{children}</p>
  }
}

export function Leaf({ leaf, attributes, children }) {
  return <span {...attributes}>{children}</span>
}

//*****************************************************************************
//
// Doc --> Slate
//
//*****************************************************************************

function createElement({ type, id, attributes, children }) {
  return {
    type,
    id: id ?? nanoid(),
    attributes,
    children
  }
}

//-----------------------------------------------------------------------------

export function section2edit(doc) {
  const head = Head2Slate(doc.story.body.head);
  const body = Section2Slate(doc.story.body.parts);
  const notes = Section2Slate(doc.story.notes);

  return {
    body: [...head, ...body],
    notes: notes,
  }

  function Head2Slate(head) {
    if(head.title) return [
      createElement({ type: "title", children: [{ text: head.title }] }),
    ]
    return []
  }

  function Section2Slate(parts) {
    const content = parts.map(Part2Slate).flat(1)
    if(!content.length) return [createElement({type: "p", children: [{text: ""}]})]
    return content;
  }

  function Part2Slate(part, index) {
    const name = part.name ?? ""
    const head = createElement({type: "br.part", id: part.id, children: [{ text: name }]})

    const scenes = part.children.map(Scene2Slate).flat(1)
    //const content = (index === 0 && name === "") ? scenes : [head, ...scenes]
    //return content
    return [head, ...scenes]
  }

  function Scene2Slate(scene, index) {
    const name = scene.name ?? ""
    const head = createElement({type: "br.scene", id: scene.id, children: [{ text: name }]})
    const para = scene.children.map(Paragraph2Slate)
    //const content = (index === 0 && name === "") ? para : [head, ...para]
    //return content
    return [head, ...para]
  }

  function Paragraph2Slate(p) {
    const type = p.type;
    return createElement({
      type: type === "br" ? "p" : type,
      id: p.id,
      children: [
        {
          text: p.children ? p.children.map(e => e.text).join(" ") : ""
        }
      ]
    })
  }
}

//*****************************************************************************
//
// Slate --> Doc
//
//*****************************************************************************

export function edit2section(content) {
  const [head, parts] = getHead()
  return {
    head: {},
    parts: splitByLeadingElem(parts, isPartBreak)
      .filter(p => p.length)
      .map(elems => edit2part(elems))
  }

  function getHead() {
    return [
      content.filter(elem => isHeadElement(elem)),
      content.filter(elem => !isHeadElement(elem))
    ]
  }
}

function isHeadElement(elem) {
  return [
    "title",
  ].includes(elem.type)
}

function isPartBreak(elem) {
  return elem.type === "br.part"
}

function isSceneBreak(elem) {
  return elem.type === "br.scene"
}

export function edit2part(content) {
  const [head, scenes] = getHead()
  return {
    type: "part",
    name: elem2text(head),
    id: head?.id ?? nanoid(),
    children: splitByLeadingElem(scenes, isSceneBreak)
      .filter(s => s.length)
      .map(elems => edit2scene(elems)),
  }

  function getHead() {
    if (isPartBreak(content[0])) {
      return [content[0], content.slice(1)]
    }
    return [
      { type: "br.part", attributes: {}, children: [{ text: "" }] },
      content,
    ]
  }
}

export function edit2scene(content) {
  const [head, paragraphs] = getHead()

  return {
    type: "scene",
    name: elem2text(head),
    id: head?.id ?? nanoid(),
    children: paragraphs.map(elem => getParagraph(elem))
  }

  function getHead() {
    if (isSceneBreak(content[0])) {
      return [content[0], content.slice(1)]
    }
    return [
      { type: "br.scene", children: [{ text: "" }] },
      content,
    ]
  }

  function getParagraph(elem) {
    const text = elem2text(elem)
    const tag = elem.type

    return {
      type: tag === "p" && text === "" ? "br" : tag,
      id: elem?.id ?? nanoid(),
      children: [{
        type: "text",
        text,
      }],
    }
  }
}

//*****************************************************************************
//
// Editor customizations
//
//*****************************************************************************

export function getEditor() {
  const editor = withHistory(withReact(createEditor()))

  //---------------------------------------------------------------------------

  /*
  const { normalizeNode } = editor;

  editor.normalizeNode = entry => {
    const [node, path] = entry

    //console.log("Node/path:", node, path)

    return normalizeNode(entry)
  }
  */

  //---------------------------------------------------------------------------

  /*
  const { isVoid } = editor;

  editor.isVoid = element => {
    switch (element.type) {
      case "br": return true;
    }
    return isVoid(element)
  }
  */

  //---------------------------------------------------------------------------
  // Take care of element IDs

  const {apply} = editor;

  editor.apply = (operation) => {
    //console.log("Apply:", operation)
    switch(operation.type) {
      default: break;
      case "insert_node": {
        operation.node.id = nanoid()
        return apply(operation)
      }
      case "split_node": {
        operation.properties.id = nanoid()
        return apply(operation)
      }
    }
    return apply(operation);
  }

  //---------------------------------------------------------------------------

  const STYLEAFTER = {
    "title": "p",
    "br.scene": "p",
    "br.part": "p",
    "synopsis": "p",
  }

  const RESETEMPTY = [
    "comment",
    "missing",
  ]

  const { insertBreak } = editor

  editor.insertBreak = () => {
    const { selection } = editor

    if (selection) {
      const [match] = Editor.nodes(editor, {
        match: n =>
          !Editor.isEditor(n) &&
          Editor.isBlock(editor, n)
      })

      if (match) {
        const [node, path] = match

        //console.log("Node:", node)

        if(node.type in STYLEAFTER) {
          const newtype = STYLEAFTER[node.type]
          Transforms.splitNodes(editor, {always: true})
          Transforms.setNodes(editor, {type: newtype})
          return
        }
        if(RESETEMPTY.includes(node.type)) {
          if(node.children.length > 1 || node.children[0].text) {
            Transforms.splitNodes(editor, {always: true})
            //Transforms.setNodes(editor, {id: createID(node.type)})
          } else {
            Transforms.setNodes(editor, {type: "p"});
          }
          return
        }
      }
    }
    insertBreak()
  }

  //---------------------------------------------------------------------------

  const SHORTCUTS = {
    '##': "br.scene",
    '>>': "synopsis",
    '//': 'comment',
    '!!': 'missing',
  }

  const { insertText } = editor

  editor.insertText = text => {
    const { selection } = editor

    //if (text === ' ' && selection && Range.isCollapsed(selection)) {
    if (selection && Range.isCollapsed(selection)) {
      const { anchor } = selection
      const node = Editor.above(editor, {
        match: n => Editor.isBlock(editor, n),
      })
      const path = node ? node[1] : []
      const start = Editor.start(editor, path)
      const range = { anchor, focus: start }
      const beforeText = Editor.string(editor, range)
      const type = SHORTCUTS[beforeText + text]

      if (type) {
        Transforms.select(editor, range)
        Transforms.delete(editor)
        Transforms.setNodes(editor,
          {type, id: nanoid() },
          {
            match: n => Editor.isBlock(editor, n),
          }
        )

        return
      }
    }

    insertText(text)
  }

  //---------------------------------------------------------------------------

  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    const { selection } = editor

    if (selection && Range.isCollapsed(selection)) {
      const match = Editor.above(editor, {
        match: n => Editor.isBlock(editor, n),
      })

      if (match) {
        const [node, path] = match
        const start = Editor.start(editor, path)

        //console.log("Node:", node)

        if (
          !Editor.isEditor(node) &&
          Editor.isBlock(editor, node) &&
          node.type !== 'p' &&
          Point.equals(selection.anchor, start)
        ) {
          //console.log(block.type)
          Transforms.setNodes(editor, {type: 'p'})

          return
        }
      }
    }
    deleteBackward(...args)
  }

  return editor
}

//*****************************************************************************
//
// Creating editor
//
//*****************************************************************************

export function SlateEdit({editor, className, content, setContent, ...props }) {

  const renderElement = useCallback(props => <Element {...props} />, [])
  const renderLeaf = useCallback(props => <Leaf {...props} />, [])

  return (
      <Slate
        editor={editor}
        value={content}
        onChange={setContent}
      >
        <Editable
          className={addClass(className, "Sheet")}
          autoFocus
          spellCheck={false} // Keep false until you find out how to change language
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          {...props}
        />
    </Slate>
  )
}
