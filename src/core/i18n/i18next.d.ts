import "i18next";
import type common from "@/locales/en/common.json";
import type errors from "@/locales/en/errors.json";
import type auth from "@/modules/auth/locales/en.json";
import type collaborators from "@/modules/collaborators/locales/en.json";
import type home from "@/modules/home/locales/en.json";
import type issues from "@/modules/issues/locales/en.json";
import type pulls from "@/modules/pulls/locales/en.json";
import type queue from "@/modules/queue/locales/en.json";
import type repos from "@/modules/repos/locales/en.json";
import type secrets from "@/modules/secrets/locales/en.json";
import type inbox from "@/modules/inbox/locales/en.json";
import type gists from "@/modules/gists/locales/en.json";
import type stars from "@/modules/stars/locales/en.json";
import type search from "@/modules/search/locales/en.json";
import type audit from "@/modules/audit/locales/en.json";
import type insights from "@/modules/insights/locales/en.json";
import type files from "@/modules/files/locales/en.json";
import type actions from "@/modules/actions/locales/en.json";
import type branches from "@/modules/branches/locales/en.json";
import type deps from "@/modules/deps/locales/en.json";
import type releases from "@/modules/releases/locales/en.json";
import type scheduler from "@/modules/scheduler/locales/en.json";
import type migration from "@/modules/migration/locales/en.json";
import type upload from "@/modules/upload/locales/en.json";
import type security from "@/modules/security/locales/en.json";
import type settings from "@/modules/settings/locales/en.json";
import type webhooks from "@/modules/webhooks/locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      errors: typeof errors;
      auth: typeof auth;
      collaborators: typeof collaborators;
      home: typeof home;
      issues: typeof issues;
      pulls: typeof pulls;
      queue: typeof queue;
      repos: typeof repos;
      secrets: typeof secrets;
      inbox: typeof inbox;
      gists: typeof gists;
      stars: typeof stars;
      search: typeof search;
      audit: typeof audit;
      insights: typeof insights;
      files: typeof files;
      actions: typeof actions;
      branches: typeof branches;
      deps: typeof deps;
      releases: typeof releases;
      scheduler: typeof scheduler;
      migration: typeof migration;
      upload: typeof upload;
      security: typeof security;
      settings: typeof settings;
      webhooks: typeof webhooks;
    };
  }
}
