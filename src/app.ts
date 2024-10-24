// src/server.ts
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';
import { Consumer, Producer, Router, RtpCodecCapability, Transport, Worker } from 'mediasoup/node/lib/types';
import path from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('./public/'))

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {},
  },
];

let worker: Worker;
let rooms: { [key: string]: {
  routers: { [key: string]: Router<mediasoup.types.AppData> },
  transports: { [key: string]: Transport },
  producers: { [key: string]: Producer },
  consumers: { [key: string]: Consumer },
  clients: { [key: string]: string[] };
} } = {};

const createWorker = async () => {
  worker = await mediasoup.createWorker();
  console.log('Mediasoup worker created');
  worker.on('died', () => {
    console.error('Mediasoup worker died. Exiting process...');
    process.exit(1);
  });
};

const createRouter = async (roomId: string, socketId: string) => {
  const router = await worker.createRouter({ mediaCodecs });
  rooms[roomId].routers[socketId] = router;
  console.log(`Router created for socket: ${socketId} in room: ${roomId}`);
};

const createTransport = async (roomId: string, socketId: string) => {
  const router = rooms[roomId].routers[socketId];
  const transport = await router.createWebRtcTransport({
    listenIps: ['0.0.0.0'], // Allows external access
    enableTcp: true,
    enableUdp: true,
    preferUdp: true,
  });

  rooms[roomId].transports[socketId] = transport;

  return {
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
};

const runServer = async () => {
  await createWorker();

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('create-room', (roomId, callback) => {
      if (!rooms[roomId]) {
          rooms[roomId] = {
              routers: {},
              transports: {},
              producers: {},
              consumers: {},
              clients: {} // Initialize clients as an empty object
          };
          console.log(`Room ${roomId} created`);
          callback({ success: true, message: `Room ${roomId} created` });
      } else {
          console.log(`Room ${roomId} already exists`);
          callback({ success: false, message: `Room ${roomId} already exists. Joining...` });
      }
      rooms[roomId].clients[socket.id] = []; // Initialize client's streams array
      socket.join(roomId); // Join the room
  });

  socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Handle client disconnect logic
  });

  socket.on('join-room', (roomId, username, callback) => {
      if (rooms[roomId]) {
          console.log(`${username} joined room ${roomId}`);
          callback({ success: true, message: `${username} joined room ${roomId}` });
      } else {
          callback({ success: false, message: `Room ${roomId} does not exist.` });
      }
  });

    socket.on('create-transport', async (roomId, callback) => {
      const transportParams = await createTransport(roomId, socket.id);
      callback(transportParams);
    });

    socket.on('produce', async (roomId, data, callback) => {
      const transport = rooms[roomId].transports[socket.id];
      const producer = await transport.produce(data);
      rooms[roomId].producers[socket.id] = producer;
      callback({ id: producer.id });
    });

    socket.on('consume', async (roomId, producerId, callback) => {
      const router = rooms[roomId].routers[socket.id];
      const transport = rooms[roomId].transports[socket.id];
      const producer = rooms[roomId].producers[producerId];

      if (!producer) {
        return callback({ error: 'Producer not found' });
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
      });

      rooms[roomId].consumers[socket.id] = consumer;
      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Clean up: remove transports, producers, consumers, and routers from the room
      for (const roomId in rooms) {
        delete rooms[roomId].transports[socket.id];
        delete rooms[roomId].producers[socket.id];
        delete rooms[roomId].consumers[socket.id];
        delete rooms[roomId].routers[socket.id];
      }
    });
  });

  server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
  });
};

runServer().catch((error) => {
  console.error('Error starting the server:', error);
});