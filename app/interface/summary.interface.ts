
export type dataObject = {
  file: string;
  complexity: number;
  functions: functionObject[];
  functionTotal: number;
  complexityTotal: number;
  complexityAverage: number;
};

export type functionObject = {
  name: string;
  line: number;
  complexity: number;
};

export type functionComplexity = {
  name: string;
  complexity: number;
  file: string;
  line: number;
};

export type dataObjectCompare = {
  file: string;
  complexity: number;
  compareAComplexity?: number;
  compareBComplexity?: number;
  functionTotal: number;
  compareAFunctionTotal?: number;
  compareBFunctionTotal?: number;
  complexityTotal: number;
  complexityAverage: number;
  compareAComplexityAverage?: number;
  compareBComplexityAverage?: number;
  complexityChange: number;
  functionTotalChange: number;
  complexityTotalChange: number;
  complexityAverageChange: number;
  report?: string;
  status: string;
};