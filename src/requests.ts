import {
  createRequest,
  Client,
  IRequest,
  INotification,
  createNotification,
} from "./client";

export interface IOperationParams {
  stagingFolder: string;
}

export interface IStartOperationPayload {
  params: IOperationParams;
}

export interface IOperationResultPayload {
  success: boolean;
  errorMessage?: string;
  errorStack?: string;
}

export const Version = {
  Get: createRequest<
    {},
    {
      version: string;
      versionString: string;
    }
  >("Version.Get"),
};

export const Operation = {
  Start: createRequest<IStartOperationPayload, IOperationResultPayload>(
    "Operation.Start",
  ),
  Progress: createNotification<{
    progress: number;
    eta: number;
    bps: number;
  }>("Operation.Progress"),
};
