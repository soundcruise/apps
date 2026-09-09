import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRACTICE_CALENDAR_ICONS, PRACTICE_CALENDAR_SCHEMA_VERSION} from './practice-menu-calendar-store.js';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const source=read('practice-menu-app.js');
test('icon click fills only trimmed-empty text using formal labels',()=>{
 const handler=source.split("elements.calendarNoteIcons.addEventListener('click', (event) => {")[1].split("\n});")[0];
 const listener=new Function('event','state','elements','PRACTICE_CALENDAR_ICONS','renderPracticeCalendarIconChoices',handler);
 const text={value:''};const elements={calendarNoteText:text,calendarNoteIcons:{querySelector:()=>null}};
 const click=key=>listener({target:{closest:()=>({dataset:{calendarNoteIcon:key}})}},{},elements,PRACTICE_CALENDAR_ICONS,()=>{});
 for(const {value,label} of PRACTICE_CALENDAR_ICONS){for(const blank of ['','   ','\n']){text.value=blank;click(value);assert.equal(text.value,label);}}
 for(const existing of ['宇都宮でライブ','ライブ']){text.value=existing;click('recording');assert.equal(text.value,existing);}
 assert.equal(PRACTICE_CALENDAR_SCHEMA_VERSION,2);
 assert.doesNotMatch(handler,/calendarNoteText\.focus|scrollIntoView|\.blur\(/);
});
test('upper and lower edit share the existing action in both editions',()=>{
 for(const file of ['index.html','pro_9a3943176561/index.html']){assert.match(read(file),/id="practice-edit-top"/);assert.match(read(file),/id="practice-edit"/);}
 assert.match(source,/elements.editButton.addEventListener\('click', openActivePracticeEditor\)/);
 assert.match(source, /querySelector\('#practice-edit-top'\).addEventListener\('click', openActivePracticeEditor\)/);
});
