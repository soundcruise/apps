import {AGM_SPECIFIC_LABEL} from './agm-editorial-subject.js';
// Labels contain bounded identifiers and controlled themes, never source sentences.
import {validBook} from './agm-book-evidence.js';
import {agmPerformanceLabel} from './agm-performance-evidence.js';
import {validEventDay} from './agm-performance-evidence.js';
export const ARTICLE_TOPICS=Object.freeze({chord_progression:'コード進行',headphone:'ヘッドホン',acoustic:'アコースティック・ギター',singing:'ギター弾き語り',songwriting:'作曲とアコースティック・ギター',guitar_roots:'ギターを始めた経緯',solo:'ソロ・ギター',guitar_career:'ギタリストとしての歩み',fingerstyle:'フィンガーピッキング',rhythm:'リズム',home_recording:'自宅での音楽制作'});
export const ARTICLE_FOCUS=Object.freeze({singing_technique:'弾き語りの歌い方',acoustic_records:'弾き語りの参考にしたアルバム',ai_music:'音楽制作でのAIとの付き合い方',mic_placement:'アコギ録音のマイク配置',recording_latency:'録音時のレイテンシー対策',headphone_choice:'音楽制作向けヘッドホンの選び方',chord_transposition:'コード進行の移調',strumming:'弾き語りのストローク',fingerpicking_basics:'フィンガーピッキングの基礎'});
export const factName=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=80&&!/[<>\x00-\x1f]/.test(v);
export function acousticEditorialType(type){return type==='review'||type==='column';}
export function agmEditorialCategory(type){
 if(acousticEditorialType(type))return 'acoustic_guitar';
 return ['interview','equipment','artist_news'].includes(type)?'artist_guitar':'media_other';
}
// Saved receipts from before the display policy change retain their original category.
export function validAgmEditorialCategory(f){
 return f.category===agmEditorialCategory(f.articleType)||(acousticEditorialType(f.articleType)&&f.category==='media_other');
}
export function specificEditorialLabel(f,topic){
 if(f.person!==undefined&&!factName(f.person)||f.people!==undefined&&(!Array.isArray(f.people)||f.people.length<2||f.people.length>3||f.people.some(p=>!factName(p))||f.people.join('・')!==f.person))return null;
 const subject=f.person||f.author,focus=ARTICLE_FOCUS[f.focus];
 if(f.format!==undefined&&!['qa','interview','explanation'].includes(f.format))return null;
 if(f.format==='qa'&&['column','interview','lesson','beginner'].includes(f.articleType))return f.person&&focus?`${f.person}、${focus}についてQ&A形式で語る`:null;
 if(f.format==='interview'&&['column','lesson','beginner','interview'].includes(f.articleType)&&subject&&(focus||topic))return `${subject}、${focus||topic}について語るインタビュー`;
 if(f.focus==='acoustic_records'&&!f.person)return null;
 if(focus&&['column','lesson','beginner'].includes(f.articleType))return `${subject?subject+'、':''}${focus}${f.focus==='acoustic_records'?'を紹介':'を解説'}`;
 if(f.articleType==='review'&&f.trialPerformer!==undefined){
  return f.section==='gears'&&f.trialPerformer===f.person&&factName(f.trialPerformer)&&f.models?.length===1&&factName(f.models[0])?f.trialPerformer+'が'+f.models[0]+'を試奏':null;
 }
 if(f.articleType==='review')return f.models?.length&&f.models.length<=4&&f.models.every(factName)?`${f.models.join(' / ')}の試奏・レビュー記事を公開`:null;
 if(f.articleType==='equipment')return subject&&f.models?.length&&f.models.length<=4&&f.models.every(factName)?`${subject}、${f.models.length===1?f.models[0]+'の使用機材':f.models.length+'種類の愛用ギター'}を紹介`:null;
 if(f.articleType==='interview')return subject&&topic?`${subject}、${topic}について語る`:null;
 if(['column','lesson','beginner'].includes(f.articleType)&&topic&&!['acoustic','singing','solo','home_recording','recording'].includes(f.topic))return `${subject?subject+'、':''}${f.song?'「'+f.song+'」の':''}${topic}${f.articleType==='column'?'を解説':f.articleType==='lesson'?'の演奏解説記事を公開':'の初心者向け解説記事を公開'}`;
 return null;
}
export function agmArticleLabel(f,event){
 if(event!=='agm_editorial'||f?.kind!=='agm_editorial'||!['agm_explicit_article_v1','agm_human_book_v1'].includes(f.evidence)||!['beginners','lesson','gears','interview','news','column'].includes(f.section)||!/^https:\/\/acousticguitarmagazine\.jp\//.test(f.articleUrl||''))return null;
 if(f.evidence==='agm_human_book_v1'&&f.articleType!=='book_release')return null;
 const type=f.articleType,person=f.person,topic=ARTICLE_TOPICS[f.topic];
 if(type==='book_release')return f.section==='news'&&f.category==='media_other'&&validBook(f)?`${f.author}の教則本『${f.bookTitle}』、${Number(f.releaseDate.slice(5,7))}月${Number(f.releaseDate.slice(8,10))}日${f.evidence==='agm_human_book_v1'?'の発売情報':'に発売予定'}`:null;
 if(type==='performance_event')return agmPerformanceLabel(f);
 if(person!==undefined&&!factName(person)||f.author!==undefined&&!factName(f.author)||f.focus!==undefined&&!Object.hasOwn(ARTICLE_FOCUS,f.focus))return null;
 if(!validAgmEditorialCategory(f))return null;
 if(['interview','equipment','artist_news'].includes(type)&&!person)return null;
 if(f.models!==undefined&&(!Array.isArray(f.models)||!f.models.length||f.models.length>4||f.models.some(m=>!factName(m))))return null;
 if(f.labelPolicy===AGM_SPECIFIC_LABEL&&['column','lesson','beginner','interview','equipment','review'].includes(type))return specificEditorialLabel(f,topic);
 if(f.focus&&['column','lesson','beginner'].includes(type)){const subject=person||f.author;return `${subject?subject+'、':''}${ARTICLE_FOCUS[f.focus]}を解説`;}
 if(type==='review'&&f.section==='gears'&&f.models?.length)return `${f.models.join(' / ')}の試奏・レビュー記事を公開`;
 if(type==='equipment'&&f.section==='gears'&&f.models?.length)return `${person}、${f.models.length===1?f.models[0]+'の使用機材':f.models.length+'種類の愛用ギター'}を紹介`;
 if(type==='artist_news'&&f.section==='news'){
  if(f.action==='tour'&&factName(f.eventName))return `${person}、ツアー「${f.eventName}」の開催情報`;
  if(f.action==='award'&&factName(f.award)&&factName(f.work))return `${person}、${f.award}で受賞`;
  if(f.action==='music_release'&&f.works?.length>=1&&f.works.length<=2&&f.works.every(factName)&&['EP','アルバム'].includes(f.releaseType)){
   if(f.releaseDate!==undefined&&(!validEventDay(f.releaseDate)||f.releaseEvidence?.basis!=='explicit_primary_music_release'||f.releaseEvidence.subject!=='named_artist_work'))return null;
   if(f.performanceScope!==undefined&&f.performanceScope!=='all_instruments_except_drums')return null;
   if(f.performanceScope==='all_instruments_except_drums'&&f.works.length===1)return `${person}、ドラム以外を自ら演奏した新作『${f.works[0]}』${f.releaseDate?'を'+Number(f.releaseDate.slice(5,7))+'月'+Number(f.releaseDate.slice(8,10))+'日にリリース':'のリリース情報'}`;
   return `${person}、${f.releaseType}『${f.works.join('』『')}』${f.releaseDate?'を'+Number(f.releaseDate.slice(5,7))+'月'+Number(f.releaseDate.slice(8,10))+'日にリリース':'のリリース情報'}`;
  }
  return null;
 }
 if(type==='publication'&&f.section==='news'&&f.topic==='parlor_guitar'&&/^Vol\.\d{1,3}$/.test(f.issue||''))return `アコースティック・ギター・マガジン${f.issue}、小型ギターの特集を掲載`;
 if(!topic)return null;
 const suffix={beginner:'の初心者向け解説記事を公開',lesson:'の演奏解説記事を公開',column:'について解説',interview:'について語るインタビュー',equipment:'の使用機材を紹介',review:'の試奏・レビュー記事を公開'}[type];
 if(!suffix)return null;
 const song=f.song;if(song!==undefined&&!factName(song))return null;
 const subject=person||f.author;return `${subject?subject+'、':''}${song?'「'+song+'」の':''}${topic}${suffix}`;
}
