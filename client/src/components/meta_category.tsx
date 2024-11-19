import { useLocation } from "wouter";

export function MetaCategory({ name }: { name: string }) {
    const [_, setLocation] = useLocation();
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                setLocation(`/categories/${name}`);
            }}
            className="text-base t-secondary hover:text-theme text-pretty overflow-hidden"
        >
            <div className="flex gap-0.5">
                <div className="text-sm opacity-70 italic">/</div>
                <div className="text-sm opacity-70">
                    {name}
                </div>
            </div>
        </button>
    );
}
