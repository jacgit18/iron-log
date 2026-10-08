-- migrate:up

-- Migration 008: Better Auth's tables (ADR 004), in their own `auth` schema so they never mix with ours. The definitions are
-- what Better Auth 1.7.7 generates for Google sign-in (`getMigrations(...).compileMigrations()`), with the schema added;
-- the app never lets Better Auth create tables itself. `users.auth_user_id` (migration 001) holds `auth."user".id`, with no
-- foreign key across the two, so the identity provider can change without touching our data (FM-19).
-- Better Auth reaches these tables by schema-qualified name (modelName in server/auth/betterAuth.ts), not by search_path,
-- because a pooled connection may not honor a session-level setting.

create schema auth;

create table auth."user" (
  "id"            text not null primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" boolean not null,
  "image"         text,
  "createdAt"     timestamptz default current_timestamp not null,
  "updatedAt"     timestamptz default current_timestamp not null
);

create table auth."session" (
  "id"        text not null primary key,
  "expiresAt" timestamptz not null,
  "token"     text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references auth."user" ("id") on delete cascade
);

create table auth."account" (
  "id"                    text not null primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references auth."user" ("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz default current_timestamp not null,
  "updatedAt"             timestamptz not null
);

create table auth."verification" (
  "id"         text not null primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz default current_timestamp not null,
  "updatedAt"  timestamptz default current_timestamp not null
);

create index "session_userId_idx" on auth."session" ("userId");
create index "account_userId_idx" on auth."account" ("userId");
create index "verification_identifier_idx" on auth."verification" ("identifier");

-- migrate:down

drop schema auth cascade;
