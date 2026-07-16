/** Icon wrappers used by dashboard table and chart controls. */

import {
	AudioLines,
	BrainCircuit,
	Camera,
	CircleDollarSign,
	FileText,
	Image as ImageSymbol,
	Moon,
	Sun,
	Video,
	Zap,
} from "lucide-react";
import { RiRobot3Line } from "react-icons/ri";
import { RxTimer } from "react-icons/rx";

export function MoonIcon() {
	return <Moon aria-hidden="true" />;
}

export function SunIcon() {
	return <Sun aria-hidden="true" />;
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

export function ClockIcon() {
	return (
		<RxTimer
			aria-hidden="true"
			style={{ fill: "currentColor", stroke: "none" }}
		/>
	);
}

export function DollarIcon() {
	return <CircleDollarSign aria-hidden="true" />;
}

export function ScreenshotIcon() {
	return <Camera aria-hidden="true" />;
}

export function TextInputIcon() {
	return <FileText aria-hidden="true" />;
}

export function ImageInputIcon() {
	return <ImageSymbol aria-hidden="true" />;
}

export function AudioInputIcon() {
	return <AudioLines aria-hidden="true" />;
}

export function VideoInputIcon() {
	return <Video aria-hidden="true" />;
}
