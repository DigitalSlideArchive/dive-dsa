const sizeFormatter =(size: number, { base = 1024, unit = 'B' } = {})  =>{
    if (size < base) {
    return `${size} ${unit}`;
    }

    let i;
    let val = size;
    for (i = 0; val >= base && i < 4; i += 1) {
    val /= base;
    }

    return `${val.toFixed(2)}  ${['', 'K', 'M', 'G', 'T'][i]}${unit}`;
};

const countFormatter = (count: number | null) => {
  if (count && count > 1000) {
    return `${(count / 1000).toFixed(2)}k`;
  }
  return count ? count : 0;
}

const convertInputNumber = (e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    return parseInt(val);
  }

const convertInputString= (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  return val as string;
}

function isValidRegex(pattern: string) {
  try {
    new RegExp(pattern);
    return true;
  } catch (error) {
    // The RegExp constructor throws a SyntaxError if the pattern is invalid.
    return false;
  }
}

export {
    sizeFormatter,
    isValidRegex,
    countFormatter,
    convertInputNumber,
    convertInputString,
}