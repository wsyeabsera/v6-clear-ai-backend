import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@external"])

  type Mutation {
    ask(
      query: String!
      sessionId: ID
      configId: ID
    ): AskResponse!
    plan(
      query: String!
      sessionId: ID
      configId: ID
    ): PlanResponse!
    execute(
      query: String!
      sessionId: ID
      configId: ID
      maxIterations: Int
    ): ExecutionResponse!
  }

  type AskResponse {
    id: ID!
    sessionId: ID!
    response: String!
    tokensUsed: Int
    model: String!
    timestamp: String!
  }

  type Query {
    conversation(sessionId: ID!): Conversation
    conversations: [Conversation!]!
  }

  type Conversation {
    sessionId: ID!
    messages: [Message!]!
    createdAt: String!
    updatedAt: String
  }

  type Message {
    id: ID!
    role: String!
    content: String!
    timestamp: String!
  }

  type PlanResponse {
    id: ID!
    sessionId: ID!
    plan: Plan!
    confidence: Float!
    timestamp: String!
  }

  type Plan {
    id: ID!
    steps: [PlanStep!]!
    estimatedDuration: Int
    requiredTools: [String!]!
    confidence: Float!
    reasoning: String
  }

  type PlanStep {
    id: ID!
    order: Int!
    description: String!
    tool: String
    parameters: JSON
    dependencies: [Int!]!
  }

  type ExecutionResponse {
    id: ID!
    sessionId: ID!
    execution: Execution!
    timestamp: String!
  }

  type Execution {
    id: ID!
    plan: Plan!
    status: ExecutionStatus!
    steps: [ExecutionStep!]!
    results: JSON
    error: String
    startedAt: String!
    completedAt: String
  }

  type ExecutionStep {
    planStepId: ID!
    status: StepStatus!
    result: JSON
    error: String
    startedAt: String
    completedAt: String
  }

  enum ExecutionStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    CANCELLED
  }

  enum StepStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    SKIPPED
  }

  scalar JSON
`;

