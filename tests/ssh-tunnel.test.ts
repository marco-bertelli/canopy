import { it, expect } from "vitest";
import { tunnelTarget } from "../electron/ssh-tunnel";

it("points the URI at the local forward and targets the first host", () => {
  expect(tunnelTarget("mongodb://localhost", 4000)).toEqual({
    host: "localhost",
    port: 27017,
    uri: "mongodb://127.0.0.1:4000/?directConnection=true",
  });
  expect(
    tunnelTarget(
      "mongodb://u%40x:p%2Fw@db1.internal:27018,db2:27017/app?replicaSet=rs0&directConnection=false&tls=true",
      4000,
    ),
  ).toEqual({
    host: "db1.internal",
    port: 27018,
    uri: "mongodb://u%40x:p%2Fw@127.0.0.1:4000/app?replicaSet=rs0&tls=true&directConnection=true",
  });
  expect(tunnelTarget("mongodb://[::1]:27019/?", 1).host).toBe("::1");
  expect(tunnelTarget("mongodb://h/db", 1).uri).toBe(
    "mongodb://127.0.0.1:1/db?directConnection=true",
  );
  expect(() => tunnelTarget("mongodb+srv://cluster.example.net", 1)).toThrow(
    /mongodb:\/\//,
  );
});
