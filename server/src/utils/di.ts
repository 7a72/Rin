import Container from "typedi";
import type { DB } from "../_worker";
import type { Env } from "../db/db";

export const envToken = "env";
export const dbToken = "db";
export const getEnv = () => Container.get<Env>(envToken);
export const getDB = () => Container.get<DB>(dbToken);
