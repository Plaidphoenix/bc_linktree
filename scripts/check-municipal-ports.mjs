import { createServer } from "node:net";

const host = "127.0.0.1";
const ports = [5173, 8787];
const occupied = [];

for (const port of ports) {
  if (!(await isPortAvailable(host, port))) {
    occupied.push(port);
  }
}

if (occupied.length) {
  console.log(
    `Homologacao municipal ja esta ativa ou as portas estao ocupadas: ${occupied.join(", ")}. ` +
      "Use a instancia existente ou encerre-a com Ctrl+C antes de iniciar novamente."
  );
  process.exitCode = 1;
} else {
  console.log("Portas municipais disponiveis. Iniciando uma unica instancia.");
}

function isPortAvailable(hostname, port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: hostname, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}
