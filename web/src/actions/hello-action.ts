'use server';
export const helloAction = async (name: string) => {
  return { message: `Hello ${name}, from server!` };
};
