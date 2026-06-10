import { BrainCircuit, CircleDollarSign, RefreshCcw, Zap } from "lucide-react";
import { RiRobot3Line } from "react-icons/ri";

export function RefreshIcon() {
	return <RefreshCcw aria-hidden="true" />;
}

export function BrainIcon() {
	return <BrainCircuit aria-hidden="true" />;
}

export function BotIcon() {
	return (
		<RiRobot3Line
			aria-hidden="true"
			style={{ fill: "currentColor", stroke: "none" }}
		/>
	);
}

export function LightningIcon() {
	return <Zap aria-hidden="true" />;
}

export function DollarIcon() {
	return <CircleDollarSign aria-hidden="true" />;
}
