export type StudentName = {
  firstName: string;
  middleName?: string | null;
  lastName: string;
};

function initial(value: string, fieldName: string): string {
  const character = Array.from(value.trim())[0];
  if (!character || !/^\p{L}$/u.test(character)) {
    throw new Error(`${fieldName} must begin with a letter`);
  }
  return character;
}

/** Uses first + optional middle + last initials; missing middle names are omitted. */
export function generateDefaultPassword(
  { firstName, middleName, lastName }: StudentName,
  year = new Date().getFullYear(),
): string {
  const initials = [
    initial(firstName, "First name"),
    ...(middleName?.trim() ? [initial(middleName, "Middle name")] : []),
    initial(lastName, "Last name"),
  ].join("");
  return `${initials[0]!.toLocaleUpperCase()}${initials.slice(1).toLocaleLowerCase()}@${year}`;
}
