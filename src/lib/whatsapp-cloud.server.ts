import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chooseOutboundKind, normalizeWhatsAppPhone } from "./message-policy";
import { decryptSecret } from "./secrets.server";

export type CloudSendInput = { userId:string;channelId:string;phone:string;body?:string;contactName?:string|null;leadId?:string|null;campaignId?:string|null;conversationId?:string|null;template?:{name:string;language:string;components?:unknown[]}|null };
const db = supabaseAdmin as any;

async function ensureConversation(input:CloudSendInput){
  const phone=normalizeWhatsAppPhone(input.phone);if(input.conversationId)return input.conversationId;
  const{data:existing}=await db.from("wa_conversations").select("id").eq("channel_id",input.channelId).eq("phone",phone).maybeSingle();
  if(existing){await db.from("wa_conversations").update({campaign_id:input.campaignId??null,lead_id:input.leadId??null,contact_name:input.contactName??null}).eq("id",existing.id);return existing.id}
  const{data,error}=await db.from("wa_conversations").insert({user_id:input.userId,channel_id:input.channelId,phone,contact_name:input.contactName??null,lead_id:input.leadId??null,campaign_id:input.campaignId??null,automation_status:"ia"}).select("id").single();
  if(error||!data)throw new Error(error?.message??"Falha ao criar conversa");return data.id as string;
}

export async function sendCloudMessage(input:CloudSendInput){
  const{data:channel}=await db.from("wa_channels").select("*").eq("id",input.channelId).eq("user_id",input.userId).single();
  if(!channel||channel.provider!=="meta"||channel.mode!=="live"||channel.status!=="connected")throw new Error("Canal Meta oficial não conectado");
  const phone=normalizeWhatsAppPhone(input.phone);
  const{data:blocked}=await db.from("wa_suppressions").select("id").eq("user_id",input.userId).eq("phone",phone).or(`channel_id.eq.${input.channelId},channel_id.is.null`).limit(1).maybeSingle();
  if(blocked)throw new Error("Contato em lista global de supressão");
  const conversationId=await ensureConversation(input);const{data:conversation}=await db.from("wa_conversations").select("customer_service_window_expires_at").eq("id",conversationId).single();
  const kind=chooseOutboundKind({windowExpiresAt:conversation?.customer_service_window_expires_at,approvedTemplate:!!input.template});
  if(kind==="blocked")throw new Error("Fora da janela de 24h: selecione um template Meta aprovado");
  if(!channel.access_token_encrypted)throw new Error("Canal sem credencial criptografada");const token=decryptSecret(channel.access_token_encrypted);
  const payload=kind==="template"?{messaging_product:"whatsapp",to:phone,type:"template",template:{name:input.template!.name,language:{code:input.template!.language},components:input.template!.components??[]}}:{messaging_product:"whatsapp",recipient_type:"individual",to:phone,type:"text",text:{preview_url:false,body:input.body||""}};
  const response=await fetch(`https://graph.facebook.com/v23.0/${channel.phone_number_id}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as any;
  if(!response.ok)throw new Error(result?.error?.message??"Meta recusou a mensagem");const externalId=result?.messages?.[0]?.id,when=new Date().toISOString(),display=input.body||`[Template: ${input.template?.name}]`;
  await db.from("wa_messages").insert({user_id:input.userId,channel_id:input.channelId,conversation_id:conversationId,direction:"saida",body:display,message_type:kind,status:"sent",external_id:externalId,sent_at:when});
  await db.from("wa_conversations").update({last_message:display.slice(0,400),last_message_at:when,last_direction:"saida"}).eq("id",conversationId);return{conversationId,externalId,mode:"live" as const,kind};
}

export async function createAiReply(args:{userId:string;conversationId:string;inbound:string;campaign:any}){
  const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)return"Recebi sua mensagem. Uma pessoa do nosso time continuará o atendimento.";
  const{data:history}=await db.from("wa_messages").select("direction,body").eq("conversation_id",args.conversationId).order("sent_at",{ascending:true}).limit(20);
  const system=["Você conversa em português brasileiro pelo WhatsApp em nome de uma empresa.",args.campaign?.objective?`Objetivo: ${args.campaign.objective}`:"",args.campaign?.agent_instructions??"Seja natural, breve e faça uma pergunta por vez.","Não pressione, não invente dados, não solicite dados sensíveis e respeite imediatamente opt-out ou pedido de humano. Responda apenas com a mensagem."].filter(Boolean).join("\n");
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL??"gpt-4.1-mini",temperature:.45,max_tokens:220,messages:[{role:"system",content:system},...(history??[]).map((m:any)=>({role:m.direction==="entrada"?"user":"assistant",content:m.body})),{role:"user",content:args.inbound}]})});
  if(!response.ok)throw new Error(`OpenAI indisponível (${response.status})`);const result=await response.json() as any;return String(result?.choices?.[0]?.message?.content||"Obrigado pela mensagem.").trim();
}
