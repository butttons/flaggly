import type { ContentfulStatusCode } from "hono/utils/http-status";

const ERROR_CODES = [
	"TOO_MANY_REQUESTS",
	"NOT_FOUND",

	"INVALID_BODY",
	"INVALID_PARAMS",

	"PUT_FAILED",
	"DELETE_FAILED",
	"UPDATE_FAILED",
] as const;

export type FlagglyErrorCode = (typeof ERROR_CODES)[number];

export class FlagglyError extends Error {
	public code: FlagglyErrorCode;
	public details?: unknown;
	constructor(
		message: string,
		code: FlagglyErrorCode,
		details?: unknown,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "FlagglyError";
		this.code = code;
		this.details = details;
	}

	toJSON() {
		return {
			code: this.code,
			message: this.message,
			details: this.details,
		};
	}

	get statusCode(): ContentfulStatusCode {
		switch (this.code) {
			case "NOT_FOUND":
				return 404;
			case "TOO_MANY_REQUESTS":
				return 429;
			case "INVALID_BODY":
			case "INVALID_PARAMS":
				return 400;
			case "PUT_FAILED":
			case "DELETE_FAILED":
			case "UPDATE_FAILED":
				return 500;
			default:
				return 500;
		}
	}
}

export async function tryPromise<T>(
	promise: Promise<T>,
	error: {
		message: string;
		code: FlagglyErrorCode;
	},
): Promise<[T, null] | [null, FlagglyError]> {
	try {
		const result = await promise;
		return [result, null];
	} catch (unknownError) {
		if (unknownError instanceof FlagglyError) {
			return [null, unknownError];
		}
		return [
			null,
			new FlagglyError(error.message, error.code, { cause: unknownError }),
		];
	}
}
