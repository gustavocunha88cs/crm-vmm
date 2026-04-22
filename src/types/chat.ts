export interface Chat {
  id: string;              // `${userId}_${remoteJid}`
  userId: string;
  remoteJid: string;       // "5582999999999@s.whatsapp.net"
  name: string;            // nome do contato ou número formatado
  lastMessage: string;
  lastMessageTime: Date | null;
  unreadCount: number;
}

export interface Message {
  id: string;              // `${userId}_${key.id}`
  chatId: string;          // `${userId}_${remoteJid}`
  userId: string;
  remoteJid: string;
  body: string;
  fromMe: boolean;
  timestamp: Date;
  status: string;
}
