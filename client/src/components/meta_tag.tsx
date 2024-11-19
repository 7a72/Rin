import { useLocation } from "wouter";

export function MetaTag({ name }: { name: string }) {
    const [_, setLocation] = useLocation();
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                setLocation(`/tags/${name}`);
            }}
            className="text-base t-secondary hover:text-theme text-pretty overflow-hidden"
        >
            <div className="flex gap-0.5">
                <div className="text-sm opacity-70 italic">#</div>
                <div className="text-sm opacity-70">
                    {name}
                </div>
            </div>
        </button>
    );
}
