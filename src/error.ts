const ERROR_CODES = [
	"FLAG_NOT_FOUND",
	"SEGMENT_NOT_FOUND",

	"INVALID_FLAG_INPUT",
	"INVALID_SEGMENT_INPUT",

	"PUT_FLAG_FAILED",
	"DELETE_FLAG_FAILED",
	"UPDATE_FLAG_FAILED",
	"GET_FLAG_FAILED",
	"GET_FLAGS_FAILED",
] as const;

export type AppKvErrorCode = (typeof ERROR_CODES)[number];

export class AppKVError extends Error {
	public code: AppKvErrorCode;
	public details?: unknown;
	constructor(
		message: string,
		code: AppKvErrorCode,
		details?: unknown,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "AppKVError";
		this.code = code;
		this.details = details;
	}

	toJSON() {
		return {
			message: this.message,
			code: this.code,
			details: this.details,
		};
	}
}

export async function tryPromise<T>(
	promise: Promise<T>,
	error: {
		message: string;
		code: AppKvErrorCode;
	},
): Promise<[T, null] | [null, AppKVError]> {
	try {
		const result = await promise;
		return [result, null];
	} catch (unknownError) {
		if (unknownError instanceof AppKVError) {
			return [null, unknownError];
		}
		return [
			null,
			new AppKVError(error.message, error.code, { cause: unknownError }),
		];
	}
}
