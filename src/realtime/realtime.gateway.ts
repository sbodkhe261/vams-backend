import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.query.token as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'vams-super-secret-key-change-in-prod',
      });

      // Assign user client to company-specific and role-specific rooms
      const companyRoom = `company_${decoded.companyId}`;
      client.join(companyRoom);

      // Join role specific room for targeted escalation notification
      const roleRoom = `company_${decoded.companyId}_role_${decoded.role}`;
      client.join(roleRoom);

      console.log(`Client ${client.id} joined rooms: [${companyRoom}, ${roleRoom}]`);
    } catch (err) {
      console.log(`WS Connection validation failed for client ${client.id}:`, err.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Broadcaster methods
  broadcastToCompany(companyId: string, event: string, payload: any) {
    this.server.to(`company_${companyId}`).emit(event, payload);
  }

  broadcastToRole(companyId: string, role: string, event: string, payload: any) {
    this.server.to(`company_${companyId}_role_${role}`).emit(event, payload);
  }
}
