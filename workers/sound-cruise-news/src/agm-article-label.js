// Labels contain bounded identifiers and controlled themes, never source sentences.
export const ARTICLE_TOPICS=Object.freeze({chord_progression:'コード進行',headphone:'ヘッドホン',acoustic:'アコースティック・ギター',singing:'ギター弾き語り',songwriting:'作曲とアコースティック・ギター',guitar_roots:'ギターを始めた経緯',solo:'ソロ・ギター',guitar_career:'ギタリストとしての歩み',fingerstyle:'フィンガーピッキング',rhythm:'リズム',home_recording:'自宅での音楽制作'});
export const factName=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=80&&!/[<>\x00-\x1f]/.test(v);
export function agmArticleLabel(f,event){
 if(event!=='agm_editorial'||f?.kind!=='agm_editorial'||f.evidence!=='agm_explicit_article_v1'||!['beginners','lesson','gears','interview','news','column'].includes(f.section)||!/^https:\/\/acousticguitarmagazine\.jp\//.test(f.articleUrl||''))return null;
 const type=f.articleType,person=f.person,topic=ARTICLE_TOPICS[f.topic];
 if(person!==undefined&&!factName(person))return null;
 const expected=['interview','equipment','artist_news'].includes(type)?'artist_guitar':'media_other';if(f.category!==expected)return null;
 if(['interview','equipment','artist_news'].includes(type)&&!person)return null;
 if(f.models!==undefined&&(!Array.isArray(f.models)||!f.models.length||f.models.length>4||f.models.some(m=>!factName(m))))return null;
 if(type==='review'&&f.section==='gears'&&f.models?.length)return `${f.models.join(' / ')}の試奏・レビュー記事を公開`;
 if(type==='equipment'&&f.section==='gears'&&f.models?.length)return `${person}、${f.models.length===1?f.models[0]+'の使用機材':f.models.length+'種類の愛用ギター'}を紹介`;
 if(type==='artist_news'&&f.section==='news'){
  if(f.action==='award'&&factName(f.award)&&factName(f.work))return `${person}、${f.award}で受賞`;
  if(f.action==='music_release'&&f.works?.length>=1&&f.works.length<=2&&f.works.every(factName)&&['EP','アルバム'].includes(f.releaseType))return `${person}、${f.releaseType}『${f.works.join('』『')}』のリリース情報`;
  return null;
 }
 if(type==='publication'&&f.section==='news'&&f.topic==='parlor_guitar'&&/^Vol\.\d{1,3}$/.test(f.issue||''))return `アコースティック・ギター・マガジン${f.issue}、小型ギターの特集を掲載`;
 if(!topic)return null;
 const suffix={beginner:'の初心者向け解説記事を公開',lesson:'の演奏解説記事を公開',column:'をテーマにした読みものを公開',interview:'について語るインタビュー',equipment:'の使用機材を紹介',review:'の試奏・レビュー記事を公開'}[type];
 if(!suffix)return null;
 const song=f.song;if(song!==undefined&&!factName(song))return null;
 return `${person?person+'、':''}${song?'「'+song+'」の':''}${topic}${suffix}`;
}
