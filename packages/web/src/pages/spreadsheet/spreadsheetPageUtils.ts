export const getApiResponseData = (response: any) => response?.data?.data ?? response?.data ?? {};

export const mergeUpdatedRow = <T extends Record<string, any>>(
  current: T,
  changes: Partial<T>,
  response: any,
) => ({
  ...current,
  ...changes,
  ...getApiResponseData(response),
});

export const buildCreatedRow = <T extends Record<string, any>>(
  data: Partial<T>,
  response: any,
) => ({
  ...data,
  ...getApiResponseData(response),
});
