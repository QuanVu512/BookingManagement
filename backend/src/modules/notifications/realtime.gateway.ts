import { WebSocketGateway } from '@nestjs/websockets';

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway {}
