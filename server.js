const { WebSocket, WebSocketServer } = require("ws");

const port = Number(process.env.PORT) || 8080;
const server = new WebSocketServer({ port });

server.on("connection", (socket) => {
  socket.on("message", (message, isBinary) => {
    for (const client of server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message, { binary: isBinary });
      }
    }
  });
});

server.on("listening", () => {
  console.log(`Servidor WebSocket escuchando en ws://localhost:${port}`);
});