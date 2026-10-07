// Test-only identity service for the isolated loopback preview. Never shipped in Worker builds.
export function previewAuth(origin){
 let active=true;
 const attempts=new Map(),sessions=new Set();
 const user={id:'11223344-5566-4778-8990-aabbccddeeff',display_name:'Dawn（本地预览）',avatar_url:origin+'/assets/preview-avatar.svg',profile_updated_at:Date.now()};
 const token=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
 return {
  authorize(url){
   const attempt=attempts.get(new URL(url).searchParams.get('request'));if(!attempt)return null;
   const back=new URL('/api/auth/callback',origin);back.searchParams.set('state',attempt.state);
   if(!active&&!attempt.interactive)back.searchParams.set('error','login_required');
   else{active=true;attempt.code=token();back.searchParams.set('code',attempt.code)}
   return back.href;
  },
  avatarFailure(value){user.avatar_url=origin+(value?'/assets/unavailable-avatar.svg':'/assets/preview-avatar.svg')},
  service:{async fetch(request){
   const op=new URL(request.url).pathname.split('/').at(-1),body=await request.json();
   if(op==='start'){const id=token();attempts.set(id,body);return Response.json({authorizationUrl:origin+'/api/auth/authorize?request='+id})}
   if(op==='exchange'){
    const attempt=[...attempts.entries()].find(([,value])=>value.state===body.state);
    const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.verifier))).toString('base64url');
    if(!attempt||attempt[1].code!==body.code||attempt[1].challenge!==challenge)return Response.json({code:'invalid_ticket'}, {status:400});
    attempts.delete(attempt[0]);const value=token();sessions.add(value);
    return Response.json({user,token:value,expiresAt:Date.now()+7200000,next:attempt[1].next});
   }
   if(!['check','profile','logout'].includes(op))return Response.json({code:'not_found'}, {status:404});
   if(!active||!sessions.has(body.token))return Response.json({code:'session_expired',user:null}, {status:401});
   if(op==='logout'){active=false;sessions.clear();return Response.json({ok:true})}
   if(op==='profile'){user.profile_updated_at=Date.now();return Response.json({user,expiresAt:Date.now()+7200000})}
   return Response.json({user,expiresAt:Date.now()+7200000,sessionId:'preview-root'});
  }},
 };
}
