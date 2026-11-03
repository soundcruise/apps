// Recognize a publisher tag link only; never fetch it or infer a manufacturer alias.
export function ikebeTagUrl(value){
 if(typeof value!=='string'||value.length>1500)return false;
 try{
  const u=new URL(value);
  if(u.origin!=='https://www.ikebe-gakki-pb.com'||u.username||u.password||u.search||u.hash)return false;
  const m=/^\/new_product\/tag\/([^/]+)\/$/.exec(u.pathname);if(!m)return false;
  const slug=decodeURIComponent(m[1]);
  return /^[\p{L}\p{N}()（）'’ʼ .&+-]{1,120}$/u.test(slug)&&slug!=='.'&&slug!=='..';
 }catch{return false;}
}
