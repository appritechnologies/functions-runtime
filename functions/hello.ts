export default async ({ req, user }) => {
  const { name = 'world' } = (req.body as any) ?? {};
  return { msg: `Hello, ${name}!`, sub: user?.role };
};