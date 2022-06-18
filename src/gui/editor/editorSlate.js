//*****************************************************************************
//*****************************************************************************
//
// File editor
//
// List of different editor frameworks:
// https://gist.github.com/manigandham/65543a0bc2bf7006a487
//
//*****************************************************************************
//*****************************************************************************

import "./editor.css"

/* eslint-disable no-unused-vars */

import React, {useState, useEffect, useMemo, useCallback} from 'react';
import { useSelector, useDispatch } from "react-redux";
import { document, docByID } from "../app/store"

//*
import { Slate, Editable, withReact } from 'slate-react'
import { createEditor } from "slate"
import { withHistory } from "slate-history"
/**/

import {
  FlexBox, VBox, HBox, Filler, VFiller, HFiller,
  ToolBox, Button, Input,
  SearchBox, addHotkeys,
  Label,
} from "../common/factory";

import isHotkey from 'is-hotkey';

//*****************************************************************************
//*****************************************************************************
//
// NOTE!!! Slate is very picky that all its components are together. So, do
// not separate Slate from its state and such things. If you do that, it will
// not work!
//
// IT WILL NOT WORK!
//
// NOTE! Do not put the same state to two editor instances. It will not work.
// Find out ways to do split'd editing views.
//
//*****************************************************************************
//*****************************************************************************

export function EditFile({id}) {

  const doc = docByID(id)

  console.log("ID", id, "Doc:", doc)
  const dispatch = useDispatch();

  const [content, setContent] = useState(deserialize(doc));

  console.log("Content:", content);
  console.log("Body:", content.body);

  function setBody(part)  { setContent({...content, body: part}) }
  function setNotes(part) { setContent({...content, notes: part}) }

  const editor = useMemo(() => withHistory(withReact(createEditor())), [])
  const renderElement = useCallback(props => <Element {...props} />, [])
  const renderLeaf = useCallback(props => <Leaf {...props} />, [])

  useEffect(() => addHotkeys({
    "mod+o": () => dispatch(document.close()),   // Go to file browser to open new file
    "mod+s": null,              // Serialize and save
    "mod+w": () => dispatch(document.close()),   // Close file
  }));

  const mode="Split";
  //const mode="Primary";

  return <VFiller>
    <ToolBar doc={doc}/>
    <div className={`Board ${mode}`}>
      <Slate editor={editor} value={content.body} onChange={setBody}>
        <Editable
          className="Sheet Shadow"
          autoFocus
          spellCheck={false} // Keep false until you find out how to change language
          renderElement={renderElement}
          renderLeaf={renderLeaf}
        />
      </Slate>
    </div>
  </VFiller>
}

//-----------------------------------------------------------------------------

export function SplitEdit({id}) {

  const doc = docByID(id)

  console.log("ID", id, "Doc:", doc)
  const dispatch = useDispatch();

  const [content, setContent] = useState(deserialize(doc));

  console.log("Content:", content);
  console.log("Body:", content.body);

  const renderElement = useCallback(props => <Element {...props} />, [])
  const renderLeaf = useCallback(props => <Leaf {...props} />, [])

  function setBody(part)  { setContent({...content, body: part}) }
  function setNotes(part) { setContent({...content, notes: part}) }

  const bodyeditor = useMemo(() => withHistory(withReact(createEditor())), [])
  const noteeditor = useMemo(() => withHistory(withReact(createEditor())), [])

  useEffect(() => addHotkeys({
    "mod+o": () => dispatch(document.close()),   // Go to file browser to open new file
    "mod+s": null,              // Serialize and save
    "mod+w": () => dispatch(document.close()),   // Close file
  }));

  //const mode="Centered";
  //const mode="Primary";
  const mode = "Split"

  return <VFiller>
    <ToolBar doc={doc}/>
      <HBox>
      <div className={`Board ${mode}`}>
        <Slate editor={bodyeditor} value={content.body} onChange={setBody}>
          <Editable
            className="Sheet Shadow"
            autoFocus
            spellCheck={false} // Keep false until you find out how to change language
            renderElement={renderElement}
            renderLeaf={renderLeaf}
          />
        </Slate>
      </div>
      <div className={`Board ${mode}`}>
        <Slate editor={noteeditor} value={content.body} onChange={setNotes}>
          <Editable
            className="Sheet Shadow"
            autoFocus
            spellCheck={false} // Keep false until you find out how to change language
            renderElement={renderElement}
            renderLeaf={renderLeaf}
          />
        </Slate>
      </div>
      </HBox>
    </VFiller>
}

//-----------------------------------------------------------------------------

function ToolBar({doc}) {
  return (
    <ToolBox>
      <Label style={{marginRight: 8}}>{doc.file.name}</Label>
      <SearchBox/>
    </ToolBox>
  )
}

function Outline({content}) {
  return (
    <div className="Outline">
    {content.body.filter(n => n.type === "scenename").map(n => <Entry text={n.children[0].text}/>)}
    </div>
  )

  function Entry(props) {
    return <div className="entry">{props.text}</div>
  }
}

//-----------------------------------------------------------------------------

function renderPlain({doc}) {

}


function Element({element, attributes, children}) {
  switch(element.type) {
    case "title": return <h1 {...attributes}>{children}</h1>
    //case "scene": return <div className="scene" {...attributes}>{children}</div>
    case "scenename": return <h2 className="scene" {...attributes}>{children}</h2>
    case "br": return <br {...attributes}/>
    case "missing":
    case "comment":
    case "synopsis":
      return <p className={element.type} {...attributes}>{children}</p>
    default: return <p {...attributes}>{children}</p>
  }
}

function Leaf({leaf, attributes, children}) {
  return <span {...attributes}>{children}</span>
}

//-----------------------------------------------------------------------------

function deserialize(doc) {
  const body = Story2Slate(doc.story);
  const notes = Part2Slate(doc.story.notes.part[0]);

  return {
    body: body,
    notes: notes,
  }

  function Story2Slate(story) {
    return [
      { type: "title", children: [{text: story.body.head.title}] },
      ]
      .concat(Part2Slate(story.body.part[0]))
      .concat([{type: "p", children: [{text: ""}]}])
  }

  function Part2Slate(part) {
    return part.children.map(Scene2Slate).flat(1);
  }

  function Scene2Slate(scene) {
    return [{
      type: "scenename",
      children: [{text: scene.attr.name}]
    }].concat(scene.children.map(Paragraph2Slate))
  }

  function Paragraph2Slate(p) {
    const type = p.tag;
    return {
      type: type,
      children: [{ text: p.text }]
    }
  }
}
