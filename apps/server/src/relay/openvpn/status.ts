export function parseConnectedCommonNames(statusCsv: string): string[] {
  const clients: string[] = [];
  for (const line of statusCsv.split("\n")) {
    if (line.startsWith("CLIENT_LIST,")) clients.push(line.split(",")[1]);
  }
  return clients;
}
