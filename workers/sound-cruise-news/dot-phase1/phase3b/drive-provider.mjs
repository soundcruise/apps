// This isolated adapter receives an existing short-lived read token from its caller.
// It neither provisions credentials nor makes network requests until invoked.
export function driveProvider({token, fetchImpl=fetch}) {
 if(typeof token!=='string'||!token) throw Error('token_required');
 async function request(url) {
  let r; try {r=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error'});} catch {throw Error('transient_error');}
  if(r.status===401||r.status===403) throw Error('auth_failed');
  if(!r.ok) throw Error('transient_error');
  return r;
 }
 const root='https://www.googleapis.com/drive/v3/files';
 function fileUrl(id){if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('invalid_file_id');return root+'/'+encodeURIComponent(id)}
 return {
  async list(folderId){
   if(!/^[A-Za-z0-9_-]+$/.test(folderId))throw Error('invalid_folder_id');
   let pageToken,files=[],pages=0;do{if(++pages>100)throw Error('too_many_pages');const q=new URLSearchParams({q:`'${folderId}' in parents and trashed = false`,fields:'nextPageToken,files(id)',pageSize:'100'});if(pageToken)q.set('pageToken',pageToken);const data=await (await request(root+'?'+q)).json();if(!Array.isArray(data.files))throw Error('invalid_listing');files.push(...data.files);pageToken=data.nextPageToken;}while(pageToken);return files;
  },
  async metadata(id){const q=new URLSearchParams({fields:'id,name,parents,version,createdTime,modifiedTime,mimeType,appProperties,trashed'});const f=await (await request(fileUrl(id)+'?'+q)).json();return {folderId:f.parents?.length===1?f.parents[0]:null,name:f.name,version:f.version,createdAt:f.createdTime,modifiedAt:f.modifiedTime,published:f.appProperties?.delivery_state==='ready'&&f.trashed===false,mimeType:f.mimeType};},
  async read(id){const m=await this.metadata(id);let url=fileUrl(id);if(m.mimeType==='application/vnd.google-apps.document')url+='/export?mimeType=text%2Fplain';else if(m.mimeType==='application/json'||m.mimeType==='text/plain')url+='?alt=media';else throw Error('unsupported_mime');const r=await request(url);const size=Number(r.headers.get('content-length'));if(Number.isFinite(size)&&size>131072)throw Error('invalid_size');const text=await r.text();if(new TextEncoder().encode(text).length>131072)throw Error('invalid_size');return text;}
 };
}
