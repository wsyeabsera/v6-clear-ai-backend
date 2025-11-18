import gql from 'graphql-tag';

export const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])

  type User @key(fields: "id") {
    id: ID!
    name: String!
    email: String!
    createdAt: String!
    updatedAt: String
    hasPassword: Boolean!
  }

  input CreateUserInput {
    name: String!
    email: String!
  }

  input UpdateUserInput {
    name: String
    email: String
  }

  type AuthTokens {
    accessToken: String!
    refreshToken: String!
  }

  type AuthUser {
    id: ID!
    name: String!
    email: String!
  }

  type AuthPayload {
    user: AuthUser!
    tokens: AuthTokens!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    validateToken(token: String!): Boolean!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    refreshToken(refreshToken: String!): AuthTokens!
  }
`;

