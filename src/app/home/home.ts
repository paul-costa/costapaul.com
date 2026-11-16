import { Component, inject } from '@angular/core';
import { MatRipple } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { CONTACT_EMAIL, LINKS } from '../links';
import { LlmFrame } from '../llm/llm-frame';
import { RouterCard } from '../router/router-card';
import { Session } from '../session';

@Component({
  selector: 'app-home',
  imports: [MatIcon, MatRipple, LlmFrame, RouterCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly session = inject(Session);
  protected readonly links = LINKS;
  protected readonly email = CONTACT_EMAIL;
  protected readonly ripple = 'rgba(255, 255, 255, 0.07)';
}
