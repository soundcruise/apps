const factName=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=80&&!/[<>\x00-\x1f]/.test(v);
import {validEventDay} from './agm-performance-evidence.js';
export function bookFields(title,paragraphs,headings,fields=[]){
 if(/訂正|お詫び|回収|中止|延期|発売済み|昨年/.test(title))return null;
 const titles=[...title.matchAll(/『([^』]{2,70})』/g)].map(m=>m[1]);
 if(titles.length!==1||!/教則本|書籍|新刊/.test(title)||!/発売/.test(title))return null;
 const bookTitle=titles[0],units=paragraphs.filter(p=>p.includes('『'+bookTitle+'』')&&!/関連|例えば|過去|発売済み|ではない|かもしれ/.test(p));
 const declarations=units.filter(p=>/発売(?:される|されます|します|となる|となります|が決定|決定|予定)/.test(p));
 const dates=[...new Set(declarations.flatMap(p=>[...p.matchAll(/(20\d{2})年(\d{1,2})月(\d{1,2})日/g)].map(m=>m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'))))];
 const credits=[...paragraphs,...headings,...fields].flatMap(p=>[...p.matchAll(/(?:著者|著|編著)\s*[:：＝]\s*([^、。\s]{2,35})/g)].map(m=>m[1]));
 const boundAuthors=units.flatMap(p=>[...p.matchAll(/([^、。\s]{2,25})(?:による教則本|が執筆した教則本|の連載をまとめた教則本)/g)].map(m=>m[1])).filter(a=>title.includes(a));
 const authors=[...new Set([...credits,...boundAuthors])];
 // A headline may name the author, but a visible book definition/credit must corroborate it.
 const author=authors.length===1?authors[0]:null;
 const publishers=[...new Set([...units,...fields].flatMap(p=>[...p.matchAll(/(?:出版社|発行元|刊行)\s*[:：＝]\s*([^、。\s]{2,50})/g)].map(m=>m[1])))];
 if(!/フラメンコ[・ ]?ギター|アコースティック[・ ]?ギター|アコギ/.test(bookTitle+' '+units.join(' ')))return null;
 if(!factName(bookTitle)||!factName(author)||!title.includes(author)||dates.length!==1||!validEventDay(dates[0])||publishers.length>1)return null;
 return {articleType:'book_release',category:'media_other',bookTitle,author,relevance:'acoustic_guitar',releaseDate:dates[0],bookEvidence:{basis:'explicit_primary_book_release',subject:'named_book'},...(publishers.length?{publisher:publishers[0]}:{})};
}
export function validBook(f){return f.articleType==='book_release'&&f.relevance==='acoustic_guitar'&&factName(f.bookTitle)&&factName(f.author)&&validEventDay(f.releaseDate)&&f.bookEvidence?.basis==='explicit_primary_book_release'&&f.bookEvidence.subject==='named_book'&&Object.keys(f.bookEvidence).length===2&&(f.publisher===undefined||factName(f.publisher));}
