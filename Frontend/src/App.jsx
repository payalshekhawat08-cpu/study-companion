import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <main className="min-h-screen px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium text-muted-foreground">
          Your course material, made easier to learn
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Study Companion
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          Add your course material to get started with grounded study tools.
        </p>
        <Button className="mt-8">Get started</Button>
      </div>
    </main>
  );
}
