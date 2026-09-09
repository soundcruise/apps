import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRACTICE_CALENDAR_ICONS, PRACTICE_CALENDAR_SCHEMA_VERSION} from './practice-menu-calendar-store.js';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const source=read('practice-menu-app.js');
test('icon click follows selection until the user edits text',()=>{
 const handler=source.split("elements.calendarNoteIcons.addEventListener('click', (event) => {")[1].split("\n});")[0];
 const listener=new Function('event','state','elements','PRACTICE_CALENDAR_ICONS','renderPracticeCalendarIconChoices',handler);
 const text={value:''};const elements={calendarNoteText:text,calendarNoteIcons:{querySelector:()=>null}};
 const state={calendarNoteUserEdited:false};
 const click=key=>listener({target:{closest:()=>({dataset:{calendarNoteIcon:key}})}},state,elements,PRACTICE_CALENDAR_ICONS,()=>{});
 for(const {value,label} of PRACTICE_CALENDAR_ICONS){click(value);assert.equal(text.value,label);}
 state.calendarNoteUserEdited=true;
 for(const existing of ['宇都宮でライブ','']){text.value=existing;click('recording');assert.equal(text.value,existing);}
 assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION,2);
 assert.doesNotMatch(handler,/calendarNoteText\.focus|scrollIntoView|\.blur\(/);
});
test('new and edit sessions initialize transient user-edit state safely',()=>{
 assert.match(source,/state\.calendarNoteUserEdited = Boolean\(note\)/);
 assert.match(source,/calendarNoteText\.addEventListener\('input',[\s\S]*calendarNoteUserEdited = true/);
 assert.match(source,/closePracticeCalendarNoteForm\(\)[\s\S]*calendarNoteUserEdited = false/);
 assert.doesNotMatch(read('practice-menu-calendar-store.js'),/calendarNoteUserEdited|userEdited/);
});
test('upper and lower edit share the existing action in both editions',()=>{
 for(const file of ['index.html','pro_9a3943176561/index.html']){assert.match(read(file),/id="practice-edit-top"/);assert.match(read(file),/id="practice-edit"/);}
 assert.match(source,/elements.editButton.addEventListener\('click', openActivePracticeEditor\)/);
 assert.match(source, /querySelector\('#practice-edit-top'\).addEventListener\('click', openActivePracticeEditor\)/);
});
