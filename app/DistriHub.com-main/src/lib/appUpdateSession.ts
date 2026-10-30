import {supabase,AUTH_STORAGE_KEY} from './supabase';

// Wait for the SDK's recovery/refresh lock before navigating away. Never copy
// tokens, restore revoked sessions or persist the operator PIN.
export async function prepareAppUpdate(expectedUserId:string|null=null){
 if(!supabase)return;
 let before:string|null;
 try{before=localStorage.getItem(AUTH_STORAGE_KEY);}catch{throw new Error('O navegador não permite salvar o login. Mantenha o app aberto e confira as permissões de armazenamento antes de atualizar.');}
 const {data,error}=await supabase.auth.getSession();
 if(error)throw new Error('Não foi possível confirmar seu login. Verifique a conexão e tente atualizar novamente.');
 if(!data.session){
  if(before||expectedUserId)throw new Error('Não foi possível recuperar o login salvo. Confirme seu acesso antes de atualizar.');
  return;
 }
 let stored:{user?:{id?:unknown};refresh_token?:unknown;access_token?:unknown}|null=null;
 try{stored=JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)??'null');}catch{/* Refuse a reload with unreadable persistence. */}
 if((expectedUserId&&expectedUserId!==data.session.user.id)||stored?.user?.id!==data.session.user.id||typeof stored.refresh_token!=='string'||!stored.refresh_token||stored.access_token!==data.session.access_token){
  throw new Error('Seu login ainda não está salvo neste navegador. Tente atualizar novamente sem fechar o app.');
 }
}
