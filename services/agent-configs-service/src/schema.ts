import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type AgentConfig @key(fields: "id") {
    id: ID!
    userId: ID!
    name: String!
    prompt: String!
    model: String!
    temperature: Float!
    maxTokens: Int!
    createdAt: String!
    updatedAt: String
  }

  input CreateAgentConfigInput {
    name: String!
    prompt: String!
    model: String!
    temperature: Float!
    maxTokens: Int!
  }

  input UpdateAgentConfigInput {
    name: String
    prompt: String
    model: String
    temperature: Float
    maxTokens: Int
  }

  type Query {
    agentConfigs: [AgentConfig!]!
    agentConfig(id: ID!): AgentConfig
  }

  type Mutation {
    createAgentConfig(input: CreateAgentConfigInput!): AgentConfig!
    updateAgentConfig(id: ID!, input: UpdateAgentConfigInput!): AgentConfig!
    deleteAgentConfig(id: ID!): Boolean!
  }
`;

