/** Icon wrappers used by dashboard table and chart controls. */

import {
	AudioLines,
	BrainCircuit,
	Camera,
	CircleDollarSign,
	FileText,
	Image as ImageSymbol,
	Video,
	Zap,
} from "lucide-react";
import { RiRobot3Line } from "react-icons/ri";

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
