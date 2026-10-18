/** A fixed educational fixture, never a measurement of the demo data or current query. */
export const examplePlan = {
  command: {
    find: "orders",
    filter: { status: "paid" },
    sort: { createdAt: -1 },
    limit: 25,
  },
  queryPlanner: {
    winningPlan: {
      stage: "SORT",
      sortPattern: { createdAt: -1 },
      inputStage: {
        stage: "COLLSCAN",
        filter: { status: { $eq: "paid" } },
        direction: "forward",
      },
    },
  },
  executionStats: {
    nReturned: 25,
    executionTimeMillis: 18,
    totalDocsExamined: 12000,
    totalKeysExamined: 0,
    executionStages: {
      stage: "SORT",
      nReturned: 25,
      executionTimeMillisEstimate: 15,
      usedDisk: false,
      sortPattern: { createdAt: -1 },
      inputStage: {
        stage: "COLLSCAN",
        nReturned: 640,
        docsExamined: 12000,
        executionTimeMillisEstimate: 12,
        filter: { status: { $eq: "paid" } },
      },
    },
  },
};
