//*****************************************************************************
//*****************************************************************************
//
// Nested editing with SlateJS
//
//*****************************************************************************
//*****************************************************************************

import React, { useMemo, useCallback } from 'react';
import { useSlate, Editable, withReact, ReactEditor } from 'slate-react'
import {
  Editor,
  Node, Text,
  Transforms,
  Range, Point,
  createEditor,
  Element,
} from 'slate'

import { withHistory } from "slate-history"
import { addClass, IsKey, Separator } from '../common/factory';
import { nanoid } from '../../util';
import { wcElem, wcCompare} from '../../document/util';

import {
  text2Regexp, searchOffsets, searchPattern,
  isAstChange,
  searchFirst, searchForward, searchBackward,
  focusByID, focusByPath,
  hasElem,
  dndElemPushTo, dndElemPop,
  elemIsBlock,
  toggleFold, foldAll, doFold,
} from "./slateHelpers"

import {
  MakeToggleGroup, Button, Icon,
  TextField, Menu, MenuItem, ListSubheader,
} from '../common/factory';
import PopupState, { bindTrigger, bindMenu } from 'material-ui-popup-state';

export {
  text2Regexp,
  isAstChange,
  searchFirst, searchForward, searchBackward,
  focusByID, focusByPath,
  hasElem,
  dndElemPushTo, dndElemPop,
}

//-----------------------------------------------------------------------------
//
// Short description of buffer format:
//
// children = [
//  part: [
//    hpart (part header/name)
//    scene: [
//      hscene (scene header/name)
//      paragraph
//      paragraph
//      ...
//    ]
//    scene
//    scene
//  ]
//  part
//  part
//]
//
//-----------------------------------------------------------------------------

//*****************************************************************************
//
// Buffer rendering
//
//*****************************************************************************

// Turn some debug features on/off - off by default

const debug = {
  //blocks: "withBorders",  // Borders around part & scene div's to make them visible
}

function renderElement({element, attributes, ...props}) {

  const {type, folded} = element

  const foldClass = folded ? "folded" : ""

  switch (type) {
    case "part":
      return <div className={addClass("part", foldClass, debug?.blocks)} {...attributes} {...props}/>

    case "scene":
      return <div className={addClass("scene", foldClass, debug?.blocks)} {...attributes} {...props}/>

    case "hpart": return <h5 {...attributes} {...props}/>
    case "hscene": return <h6 {...attributes} {...props}/>

    case "comment":
    case "missing":
    case "synopsis":
    case "fill":
    case "tags":
      return <p className={addClass(element.type, foldClass)} {...attributes} {...props}/>

    case "br":
      return <div className="emptyline" {...attributes} {...props}/>

    case "p":
    default: break;
  }

  return <p {...attributes} {...props}/>
}

function renderLeaf({ leaf, attributes, children}) {
  if(leaf.bold) {
    children = <strong>{children}</strong>
  }
  if(leaf.italic) {
    children = <em>{children}</em>
  }
  if(leaf.highlight) {
    children = <span className="highlight">{children}</span>
  }
  return <span {...attributes}>{children}</span>
}

export function SlateEditable({className, highlight, ...props}) {
  //console.log("Search:", search)

  const editor = useSlate()

  const _onKeyDown = useCallback(event => onKeyDown(event, editor), [editor])

  const re = useMemo(() => searchPattern(highlight), [highlight])

  const highlighter = useCallback(
    re
    ?
    ([node, path]) => {
      if (!Text.isText(node)) return []

      const offsets = searchOffsets(Node.string(node), re)
      const ranges = offsets.map(offset => ({
        anchor: {path, offset},
        focus: {path, offset: offset + highlight.length},
        highlight: true,
      }))
      //if(ranges.length) console.log(ranges)

      return ranges
    }
    :
    undefined,
    [re]
  )

  return <Editable
    className={className}
    spellCheck={false} // Keep false until you find out how to change language
    renderElement={renderElement}
    renderLeaf={renderLeaf}
    decorate={highlighter}
    onKeyDown={_onKeyDown}
    {...props}
  />
}

//*****************************************************************************
//
// Tool buttons
//
//*****************************************************************************

class CharStyleButtons extends React.PureComponent {

  static buttons = {
    "bold": {
      tooltip: "Bold",
      icon: <Icon.Style.Bold />
    },
    "italic": {
      tooltip: "Italic",
      icon: <Icon.Style.Italic />,
    },
    "fold": {
      tooltip: "Folded",
      icon: <Icon.Style.Folded />,
    },
  }

  static choices = ["bold", "italic"]

  render() {
    const {marks, setSelected} = this.props
    return <MakeToggleGroup
      buttons={this.constructor.buttons}
      choices={this.constructor.choices}
      selected={marks}
      setSelected={setSelected}
      exclusive={false}
    />
  }
}

class BlockStyleSelect extends React.PureComponent {

  static choices = {
    "hpart": "Part",
    "hscene": "Scene",
    "synopsis": "Synopsis",
    "comment": "Comment",
    "missing": "Missing",
    "filler": "Filler",
    "tags": "Tags",
  }

  render() {
    const {block} = this.props;
    //console.log("Block:", block)

    const choices = this.constructor.choices
    const name = block in choices ? choices[block] : "Text"

    return <PopupState variant="popover" popupId="file-menu">
      {(popupState) => <React.Fragment>
        <Button style={{width: 100, justifyContent: "flex-start"}} {...bindTrigger(popupState)}>{name}</Button>
        <Menu {...bindMenu(popupState)}>
          {Object.entries(choices).map(([k, v]) => <MenuItem value={k}>{v}</MenuItem>)}
        </Menu>
      </React.Fragment>
      }
    </PopupState>
  }
}

export function EditButtons({editor, track}) {
  //console.log("Track:", track)

  const marks = Object.entries(track.marks).filter(([k, v]) => v).map(([k, v]) => k)
  //console.log("Marks:", marks)

  const toggleMark = useCallback(marks => {
    const current = Object.keys(Editor.marks(editor))
    for(const key of current) {
      if(!marks.includes(key)) setMark(editor, key, false)
    }
    for(const key of marks) {
      if(!current.includes(key)) setMark(editor, key, true)
    }
    ReactEditor.focus(editor)
  }, [editor])

  return <>
    {/*<BlockStyleSelect block={track.block}/>*/}
    {/*<Separator/>*/}
    <CharStyleButtons marks={marks} setSelected={toggleMark}/>
    {/*<Separator/>*/}
    {/*<BlockStyleButtons block={track.block}/>*/}
    </>
}

//*****************************************************************************
//
// Marks
//
//*****************************************************************************

function isMarkActive(editor, format) {
  const marks = Editor.marks(editor)
  return marks ? marks[format] === true : false
}

function setMark(editor, format, active) {
  if (active) {
    Editor.addMark(editor, format, true)
  } else {
    Editor.removeMark(editor, format)
  }
}

function toggleMark(editor, format) {
  setMark(editor, format, !isMarkActive(editor, format))
}

//*****************************************************************************
//
// Custom hotkeys
//
//*****************************************************************************

function onKeyDown(event, editor) {

  //---------------------------------------------------------------------------
  // Styles
  //---------------------------------------------------------------------------

  if (IsKey.CtrlB(event)) {
    event.preventDefault()
    toggleMark(editor, "bold")
    return
  }

  if (IsKey.CtrlI(event)) {
    event.preventDefault()
    toggleMark(editor, "italic")
    return
  }

  //---------------------------------------------------------------------------
  // Folding
  //---------------------------------------------------------------------------

  if (IsKey.AltF(event)) {
    event.preventDefault()
    toggleFold(editor)
    return
  }
  if (IsKey.AltA(event)) {
    event.preventDefault()
    foldAll(editor, true)
    return
  }
  if (IsKey.AltS(event)) {
    event.preventDefault()
    foldAll(editor, false)
    return
  }

  //---------------------------------------------------------------------------
  // Moving
  //---------------------------------------------------------------------------

  if(IsKey.AltUp(event)) {
    event.preventDefault()

    const current = Editor.above(editor, {
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(!current) return

    const match = Editor.previous(editor, {
      at: current[1],
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(match) {
      const [,path] = match
      Transforms.select(editor, path)
      Transforms.collapse(editor)
    }
    return
  }

  if(IsKey.AltDown(event)) {
    event.preventDefault()

    const current = Editor.above(editor, {
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(!current) return

    const match = Editor.next(editor, {
      at: current[1],
      match: n => Element.isElement(n) && n.type === "scene"
    })
    if(match) {
      const [,path] = match
      Transforms.select(editor, path)
      Transforms.collapse(editor)
    }
    return
  }

  //---------------------------------------------------------------------------
  // Block styles
  //---------------------------------------------------------------------------

  if(IsKey.CtrlAlt0(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "p"})
    return ;
  }

  if(IsKey.CtrlAlt1(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "hpart"})
    return ;
  }

  if(IsKey.CtrlAlt2(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "hscene"})
    return ;
  }

  if(IsKey.CtrlAltC(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "comment"})
    return ;
  }

  if(IsKey.CtrlAltM(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "missing"})
    return ;
  }

  if(IsKey.CtrlAltS(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "synopsis"})
    return ;
  }

  if(IsKey.CtrlAltF(event)) {
    event.preventDefault()
    Transforms.setNodes(editor, {type: "fill"})
    return ;
  }

  //---------------------------------------------------------------------------
  // Misc
  //---------------------------------------------------------------------------

  if(IsKey.AltL(event)) {
    event.preventDefault()
    Transforms.insertText(editor,
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque sagittis " +
      "faucibus odio, sed fringilla lacus tempor eu. Curabitur lacinia ante quis " +
      "urna placerat, vitae ullamcorper dolor accumsan. Nam ex velit, dictum eget " +
      "porttitor vitae, aliquet at tortor. Vivamus dictum mauris ut dolor mattis, " +
      "ut pulvinar ligula scelerisque. Vivamus luctus neque nec urna sodales " +
      "fringilla. Ut gravida nibh risus, ac tempus mauris scelerisque nec. Vivamus " +
      "semper erat eget placerat imperdiet. Fusce non lorem eu diam vulputate porta " +
      "non eu nibh. Mauris egestas est tellus, id placerat libero tempus et. " +
      "Integer eget ultrices ante. Vestibulum est arcu, elementum a ornare convallis, " +
      "fringilla."
    )
    Transforms.insertNodes(editor, {type: "p", id: nanoid(), children: [{text: ""}]})
    return
  }
}

//*****************************************************************************
//
// Editor customizations
//
//*****************************************************************************

export function getEditor() {

  return [
    createEditor,
    withHistory,
    withIDs,              // Autogenerate IDs
    withWordCount,
    withBreaks,
    withFixNesting,
    withMarkup,
    withProtectFolds,     // Keep low! Prevents messing with folded blocks
    withReact,
  ].reduce((editor, func) => func(editor), undefined)
}

//-----------------------------------------------------------------------------
// Markup shortcuts
//-----------------------------------------------------------------------------

function withMarkup(editor) {

  //---------------------------------------------------------------------------
  // Markup shortcuts to create styles

  const SHORTCUTS = {
    '** ': {type: "hpart"},
    '## ': {type: "hscene"},
    '>> ': {type: "synopsis"},
    '// ': {type: 'comment'},
    '!! ': {type: 'missing'},
    '++ ': {type: 'fill'},
    '@ ': {type: 'tags'},
    //'-- ': ,
    //'<<':
    //'((':
    //'))':
    //'==':
    //'??':
    //'%%':
    //'/*':
    //'::':
  }

  const STYLEAFTER = {
    "hpart": "p",
    "hscene": "p",
    "synopsis": "p",
    "missing": "p",
    "fill": "p",
    "tags": "p",
  }

  const RESETEMPTY = [
    "synopsis",
    "comment",
    "missing",
    "fill",
    "tags",
  ]

  const UNFORMAT_ON_BKSPACE = [
    "missing",
    "fill",
    "comment",
    "synopsis",
    "tags",
    "hpart",
    "hscene",
  ]

  const { insertText } = editor

  editor.insertText = text => {
    const { selection } = editor

    if(!selection) return insertText(text)
    if(!Range.isCollapsed(selection)) return insertText(text)

    const { anchor } = selection
    const [node, path] = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })

    //const path = node ? node[1] : []
    const start = Editor.start(editor, path)
    const range = { anchor, focus: start }
    const key = Editor.string(editor, range) + text

    if(key in SHORTCUTS) {
      Transforms.select(editor, range)
      Transforms.delete(editor)
      Transforms.setNodes(editor, SHORTCUTS[key])
      return
    }

    insertText(text)
  }

  //---------------------------------------------------------------------------
  // Default styles followed by a style

  const { insertBreak } = editor

  editor.insertBreak = () => {
    const { selection } = editor

    if(!selection) return insertBreak()
    if(!Range.isCollapsed(selection)) return insertBreak()

    const [node, path] = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })

    // If we hit enter at empty line, and block type is RESETEMPTY, reset type
    if(RESETEMPTY.includes(node.type) && Node.string(node) == "") {
      Transforms.setNodes(editor, {type: "p"});
      return
    }

    // If we hit enter at line, which has STYLEAFTER, split line and apply style
    if(node.type in STYLEAFTER) {
      const newtype = STYLEAFTER[node.type]
      Editor.withoutNormalizing(editor, () => {
        Transforms.splitNodes(editor, {always: true})
        Transforms.setNodes(editor, {type: newtype, id: nanoid()})
      })
      return
    }

    insertBreak()
  }

  //---------------------------------------------------------------------------
  // Backspace at the start of line resets formatting

  const { deleteBackward } = editor;

  editor.deleteBackward = (...args) => {
    const { selection } = editor

    if(!selection) return deleteBackward(...args)
    if(!Range.isCollapsed(selection)) return deleteBackward(...args)

    // Which block we are:
    const match = Editor.above(editor, {
      match: n => Editor.isBlock(editor, n),
    })
    if(!match) return deleteBackward(...args)

    const [node, path] = match

    if(!elemIsBlock(editor, node)) return deleteBackward(...args)

    // Beginning of line?
    if(!Point.equals(selection.anchor, Editor.start(editor, path))) return deleteBackward(...args)

    if(UNFORMAT_ON_BKSPACE.includes(node.type)) {
        // Remove formatting
        Transforms.setNodes(editor, {type: 'p'})
        return
    }

    return deleteBackward(...args)
  }

  return editor
}

//*****************************************************************************
//
// Ensure that indexable blocks have unique ID
//
//*****************************************************************************

function withIDs(editor) {

  const { normalizeNode } = editor;

  editor.normalizeNode = (entry)=> {
    const [node, path] = entry

    // When argument is whole editor (all blocks)
    if(path.length > 0) return normalizeNode(entry);

    //console.log("Path/Node:", path, node)

    const blocks = Editor.nodes(editor, {
      at: [],
      match: (node, path) => !Editor.isEditor(node) && Element.isElement(node),
    })

    //console.log(Array.from(blocks))

    const ids = new Set()

    for(const block of blocks) {
      const [node, path] = block

      if(!node.id || ids.has(node.id)) {
        console.log("ID clash fixed:", node.id, path)
        const id = nanoid()
        Transforms.setNodes(editor, {id}, {at: path})
        ids.add(id)
      }
      else {
        ids.add(node.id)
      }
    }

    return normalizeNode(entry)
  }

  return editor
}

//*****************************************************************************
//
// With Word Count
//
//*****************************************************************************

function withWordCount(editor) {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry)=> {
    const [node, path] = entry

    const words = wcElem(node)
    if(!wcCompare(words, node.words)) {
      Transforms.setNodes(editor, {words}, {at: path})
      return;
    }

    return normalizeNode(entry);
  }

  return editor;
}

//*****************************************************************************
//
// With Breaks (br elements)
//
//*****************************************************************************

function withBreaks(editor) {
  const { normalizeNode } = editor;

  editor.normalizeNode = (entry)=> {
    const [node, path] = entry

    if(node.type === "p") {
      if(Node.string(node) === "") {
        Transforms.setNodes(editor, {type: "br"}, {at: path})
        return
      }
    }
    if(node.type === "br") {
      if(Node.string(node) !== "") {
        Transforms.setNodes(editor, {type: "p"}, {at: path})
        return
      }
    }

    return normalizeNode(entry);
  }

  return editor;
}

//-----------------------------------------------------------------------------
// Folded block protection: The main principle is to protect the hidden block
// from changes. If it can't be prevented, the block is unfolded.
//-----------------------------------------------------------------------------

function withProtectFolds(editor) {
  const {
    deleteBackward, deleteForward,
    insertText, insertBreak,
    apply,
  } = editor

  function unfoldSelection() {
    const match = Editor.above(editor, {
      match: n => Element.isElement(n) && n.folded,
    })
    if(!match) return false
    const [node, path] = match
    doFold(editor, node, path, false)
    return true
  }

  editor.insertBreak = () => {
    if(!unfoldSelection()) insertBreak()
  }

  editor.deleteBackward = (options) => {
    unfoldSelection()
    deleteBackward(options)
  }

  editor.deleteForward = (options) => {
    unfoldSelection()
    deleteForward(options)
  }

  editor.insertText = (text, options) => {
    unfoldSelection()
    //console.log("insertText", text, options)
    insertText(text, options)
  }

  /*
  const {isVoid} = editor
  editor.isVoid = elem => {
    if(elem.type === "fold") return true
    return isVoid(elem)
  }
  */

  return editor
}

//*****************************************************************************
//
// Maintain nested buffer integrity
//
//*****************************************************************************

//-----------------------------------------------------------------------------
// This is bit complex, mainly because it needs to be done in the order
// the normalize() feeds elements.
//
// normalize() feeds elements in bottom-up order. That means, that if you
// press "A" to insert a letter A to text block, the blocks are coming to
// normalizer() in following order:
//
//    1. Text node where the letter was inserted
//    2. Paragraph block containing the text node
//    3. Scene block containing the paragraph
//    4. Part block containing the scene
//    5. Editor containing the part
//
// What we strive for, is that:
//
//    1. Every part starts with part header
//    2. Every scene starts with scene header
//
// How we do that? As headers are the elements explicitly placed by user,
// we try to make the nesting match to the placement of headers.
//
// AS WITH FLAT EDITOR, headers are in fact *breaks*.
//
// So,
//
//    1. If you remove header, merge the block to previous one
//    2. If you place header in middle of scene, split the group from
//       that point (either to new scene or new part)
//
// There are two places where header is forced: (1) first part, and (2) first
// scene in the part. I try to get rid of that restriction, it would help
// greatly!
//
//-----------------------------------------------------------------------------

function withFixNesting(editor) {

  const { normalizeNode } = editor;

  editor.normalizeNode = entry => {
    const [node, path] = entry

    //console.log("Fix:", path, node)

    if(Text.isText(node)) return normalizeNode(entry)
    if(Editor.isEditor(node)) return normalizeNode(entry)

    switch(node.type) {
      // Paragraph styles come first
      case "hpart":
        if(!checkParent(node, path, "part")) return
        if(!checkIsFirst(node, path, "part")) return
        break;
      case "hscene":
        if(!checkParent(node, path, "scene")) return
        if(!checkIsFirst(node, path, "scene")) return;
        break;
      default:
        if(!checkParent(node, path, "scene")) return
        break;

      // Block styles come next
      case "part": {
        if(path.length > 1) {
          Transforms.liftNodes(editor, {at: path})
          return;
        }
        if(!checkBlockHeader(node, path, "hpart")) return
        break;
      }
      case "scene": {
        if(path.length < 2) {
          Transforms.wrapNodes(editor, {type: "part"}, {at: path})
          return;
        } else if(path.length > 2) {
          Transforms.liftNodes(editor, {at: path})
          return
        }
        if(!checkBlockHeader(node, path, "hscene")) return
        const match = Editor.next(editor, {at: path})
        if(!match) break;
        if(!checkBlockHeader(match[0], match[1], "hscene")) return
        break
      }
    }
    //return
    return normalizeNode(entry)
  }

  return editor

  //---------------------------------------------------------------------------
  // Check, that paragraphs are parented to scenes, and scenes are parented to
  // parts: if not, put it into a scene wrapping and let further processing
  // merge it.
  //---------------------------------------------------------------------------

  function checkParent(node, path, type) {
    //console.log("FixNesting: Check parent", node, path, type)
    const [parent, ppath] = Editor.parent(editor, path)

    if(parent.type === type) return true

    //console.log("FixNesting: Wrapping", path, node, type)
    Transforms.wrapNodes(editor, {type}, {at: path})
    return false
  }

  //---------------------------------------------------------------------------
  // Check, if header is at the beginning of block - if not, make it one.
  //---------------------------------------------------------------------------

  function checkIsFirst(node, path, type) {
    const index = path[path.length-1]

    //console.log("hscene", parent)

    if(!index) return true

    //console.log("FixNesting: Splitting", path, hscene, "scene")
    Editor.withoutNormalizing(editor, () => {
      Transforms.wrapNodes(editor, {type}, {at: path})
      Transforms.liftNodes(editor, {at: path})
    })
    return false
  }

  //---------------------------------------------------------------------------
  // Ensure, that blocks have correct header element
  //---------------------------------------------------------------------------

  function checkBlockHeader(block, path, type) {

    if(!block.children.length) {
      Transforms.removeNodes(editor, {at: path})
      return false;
    }

    const hdrtype = block.children[0].type

    // Does the block have correct header type?
    if(hdrtype === type) return true

    const prev = Editor.previous(editor, {at: path})

    // Can we merge headingless block?
    if(prev && prev[0].type === block.type) {
      doFold(editor, prev[0], prev[1], false)
      doFold(editor, block, path, false)
      Transforms.mergeNodes(editor, {at: path})

      return false
    }

    // Otherwise the block is fine as it is
    return true
  }
}
