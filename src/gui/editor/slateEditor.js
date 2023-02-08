//*****************************************************************************
//*****************************************************************************
//
// Slate customizations
//
//*****************************************************************************
//*****************************************************************************

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Slate, useSlate, Editable, withReact, ReactEditor } from 'slate-react'
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
import { sleep, uuid, nanoid, splitByLeadingElem } from '../../util';

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

export function SlateEditable({className, ...props}) {
  //const renderElement = useCallback(props => <Element {...props} />, [])
  //const renderLeaf = useCallback(props => <Leaf {...props} />, [])

  return <Editable
    className={addClass(className, "Sheet")}
    autoFocus
    spellCheck={false} // Keep false until you find out how to change language
    renderElement={Element}
    renderLeaf={Leaf}
    {...props}
  />
}

function Element({element, attributes, ...props}) {

  switch (element.type) {
    case "title": return <h1 {...attributes} {...props}/>

    case "br.part": return <h2 {...attributes} {...props}/>
    case "br.scene": return <h3 {...attributes} {...props}/>

    case "comment":
    case "missing":
    case "synopsis":
      return <p className={element.type} {...attributes} {...props}/>

    case "p":
    default:
      if (elem2text(element) === "") {
        return <div className="emptyline" {...attributes} {...props}/>
      }
      return <p {...attributes} {...props}/>
  }
}

function Leaf({ leaf, attributes, ...props }) {
  return <span {...attributes} {...props}/>
}

//*****************************************************************************
//
// Helper functions
//
//*****************************************************************************

export function elemByID(editor, id, anchor, focus) {
  if(!anchor) anchor = Editor.start(editor, [])
  if(!focus) focus = Editor.end(editor, [])

  return Array.from(Editor.nodes(editor, {
    at: {anchor, focus},
    match: (n, p) => Editor.isBlock(editor, n) && n.id === id
  }))
}

export function elemByTypes(editor, types, anchor, focus) {
  if(!anchor) anchor = Editor.start(editor, [])
  if(!focus) focus = Editor.end(editor, [])

  return Array.from(
    Editor.nodes(editor, {
      at: {anchor, focus},
      match: (node, path) => types.includes(node.type),
    })
  )
}

export function elemsByRange(editor, anchor, focus) {
  return Array.from(
    Editor.nodes(editor, {
      at: {anchor, focus},
      match: (node, path) => path.length == 1 && Editor.isBlock(editor, node),
    })
  ).map(([n, p]) => n)
}

export async function focusByPath(editor, path) {
  //console.log("Focus path:", path)
  await sleep(100);
  Transforms.select(editor, path);
  ReactEditor.focus(editor)
}

export async function focusByID(editor, id) {
  const match = elemByID(editor, id)

  if(!match.length) return;

  const [node, path] = match[0]
  focusByPath(editor, Editor.start(editor, path))
}

//*****************************************************************************
//
// Editor customizations
//
//*****************************************************************************

export function getEditor() {
  const editor = withHistory(withReact(createEditor()))

  //---------------------------------------------------------------------------
  // Extra services

  //---------------------------------------------------------------------------

  const { normalizeNode } = editor;

  editor.normalizeNode = entry => {
    const [node, path] = entry

    //console.log("Path/Node:", path, node)

    if(path.length != 1) return normalizeNode(entry)
    if(!Editor.isBlock(editor, node)) return normalizeNode(entry)

    // Force first element to be part break

    if(path[0] === 0 && node.type != "br.part") {
      Transforms.setNodes(editor, {type: "br.part"}, {at: path})
      return
    }

    if(node.type === "br.part") {
      const [next, nextpath] = Editor.next(editor, {at: path}) ?? []
      if(Editor.isBlock(editor, next)) switch(next.type) {
        case "br.part": break
        case "br.scene": break
        default:
          Transforms.setNodes(editor, {type: "br.scene"}, {at: nextpath})
          return
      }
    } else {
      const [previous] = Editor.previous(editor, {at: path}) ?? []
      //console.log("Node", node.type, "Previous", previous?.type)
      if(Editor.isBlock(editor, previous) && previous.type === "br.part") switch(node.type) {
        case "br.part": break
        case "br.scene": break
        default:
          Transforms.setNodes(editor, {type: "br.scene"}, {at: path})
          return
      }
    }

    return normalizeNode(entry)
  }

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
      case "insert_node": {
        const node = { ...operation.node, id: operation.node.id ?? nanoid() }
        return apply({...operation, node})
      }
      case "split_node": {
        const properties = { ...operation.properties, id: operation.properties.id && nanoid() }
        return apply({...operation, properties})
      }
      default: break;
    }
    return apply(operation);
  }

  //---------------------------------------------------------------------------

  const STYLEAFTER = {
    "title": "br.part",
    "br.part": "br.scene",
    "br.scene": "p",
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
        if(RESETEMPTY.includes(node.type) && Node.string(node) == "") {
          Transforms.setNodes(editor, {type: "p"});
          return
        }
      }
    }
    insertBreak()
  }

  //---------------------------------------------------------------------------

  const SHORTCUTS = {
    '** ': {type: "br.part"},
    '## ': {type: "br.scene"},
    '>> ': {type: "synopsis"},
    '// ': {type: 'comment'},
    '!! ': {type: 'missing'},
    //'-- ': ,
    //'++ ': ,
    //'<<':
    //'((':
    //'))':
    //'==':
    //'??':
    //'++':
    //'--':
    //'%%':
    //'/*':
    //'::':
  }

  const { insertText } = editor

  editor.insertText = text => {
    const { selection } = editor

    if (selection && Range.isCollapsed(selection)) {
      const { anchor } = selection
      const node = Editor.above(editor, {
        match: n => Editor.isBlock(editor, n),
      })
      const path = node ? node[1] : []
      const start = Editor.start(editor, path)
      const range = { anchor, focus: start }
      const key = Editor.string(editor, range) + text

      if(key in SHORTCUTS) {
        Transforms.select(editor, range)
        Transforms.delete(editor)
        Transforms.setNodes(editor, SHORTCUTS[key])
        return
      }
    }

    insertText(text)
  }

  //---------------------------------------------------------------------------
  // Backspace at the start of line resets formatting

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

export function section2edit(section) {
  const head = Head2Slate(section.head);
  const body = Section2Slate(section.parts);

  return [...head, ...body]

  function Head2Slate(head) {
    /*
    if(!head) return []
    if(head.title) return [
      createElement({ type: "title", children: [{ text: head.title }] }),
    ]
    */
    return []
  }

  function Section2Slate(parts) {
    const content = parts.map(Part2Slate).flat(1)
    if(!content.length) return [createElement({type: "p", children: [{text: ""}]})]
    return content;
  }

  function Part2Slate(part, index) {
    const name = part.name ?? ""
    const head = createElement({
      type: "br.part",
      id: part.id,
      children: [{ text: name }]
    })

    const scenes = part.children.map(Scene2Slate).flat(1)
    return [head, ...scenes]
  }

  function Scene2Slate(scene, index) {
    const name = scene.name ?? ""
    const {id} = scene

    const head = createElement({
      type: "br.scene",
      id,
      children: [{ text: name }]
    })

    const para = scene.children.map(Paragraph2Slate)
    return [head, ...para]
  }

  function Paragraph2Slate(p) {
    const {type, id} = p;
    return createElement({
      type: type === "br" ? "p" : type,
      id,
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
    type: "sect",
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
  const {id} = head
  const name = elem2text(head)

  return {
    type: "part",
    name: name.length ? name : undefined,
    id,
    children: splitByLeadingElem(scenes, isSceneBreak)
      .filter(s => s.length)
      .map(elems => edit2scene(elems)),
  }

  function getHead() {
    console.assert(isPartBreak(content[0]), "Missing part break")

    return [content[0], content.slice(1)]
  }
}

export function edit2scene(content) {
  const [head, paragraphs] = getHead()
  const name = elem2text(head)
  const {id} = head;

  return {
    type: "scene",
    name: name.length ? name : undefined,
    id,
    children: paragraphs.map(elem => getParagraph(elem))
  }

  function getHead() {
    console.assert(isSceneBreak(content[0]), "Missing scene break")
    return [content[0], content.slice(1)]
  }

  function getParagraph(elem) {
    const text = elem2text(elem)
    const tag = elem.type

    return {
      type: tag === "p" && text === "" ? "br" : tag,
      id: elem.id,
      children: [{
        type: "text",
        text,
      }],
    }
  }
}
